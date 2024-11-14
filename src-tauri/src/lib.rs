use futures_util::TryStreamExt;
use mail_send::mail_builder::MessageBuilder;
use mail_send::smtp::message::IntoMessage; // Import IntoMessage trait
use mail_send::SmtpClientBuilder;
use serde::{Deserialize, Serialize};
use std::env;
use std::ffi::OsStr;
use std::io::prelude::Read;
use std::io::{self, Write};
use std::path::Path;
use std::{
    collections::HashMap,
    fs::{self, File},
};
use sysinfo::Disks;
use tar::{Archive, Entry};
use tauri::WebviewWindow;
use tauri::{Emitter, Manager};

mod config;
use config::AppCfg;

/* app tar build instructions
tar --exclude='._*' --format=ustar -cf app.tar SkyUp.exe SkyUp.app
copy into update dir
tar --exclude='._*' --format=ustar -cf skytraxx5mini-app.tar update/app.tar
*/
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            get_skytraxx_device_cmd,
            download_and_update_cmd,
            send_crash_report_cmd,
            is_running_on_main_volume_cmd,
            fetch_app_installer_version_cmd
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                let version = app.package_info().version.to_string();
                let main_window = app.get_webview_window("main").unwrap();
                let current_title = main_window.title().unwrap_or("SKYTRAXX".to_string()); // Fallback to "SKYTRAXX" if title is not found
                let new_title = format!("{} v{}", current_title, version);
                main_window
                    .set_title(&new_title)
                    .expect("Failed to set window title");

                println!("--== {} ==--", new_title);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn send_crash_report_cmd(_handle: tauri::AppHandle) -> Result<(), String> {
    // Use default AppConfig values from config.rs
    let config = AppCfg::default();

    let mountpoint = find_mountpoint("Skytraxx").ok_or("Skytraxx not found")?;
    let src_path = format!("{}/cr", mountpoint);

    match fs::read_dir(&src_path) {
        Ok(dir) => {
            let mut found_cr = false;
            for entry in dir {
                let entry = entry.map_err(|err| format!("Failed to read entry: {}", err))?;
                let file_path = entry.path();
                if let Some(ext) = file_path.extension().and_then(OsStr::to_str) {
                    if ext == "txt" {
                        let filename = file_path.file_name().unwrap().to_string_lossy();
                        let file_content = fs::read_to_string(&file_path).map_err(|err| {
                            format!("Failed to read {}: {}", file_path.display(), err)
                        })?;

                        let content_with_filename =
                            format!("Filename: {}\n\n\n{}", filename, file_content);

                        let message_builder = MessageBuilder::new()
                            .from(("SkyUp", config.crash_report_email.as_ref()))
                            .to("cr@skytraxx.eu")
                            .subject("SkyUp crash report")
                            .text_body(&content_with_filename);

                        let message = message_builder
                            .into_message()
                            .map_err(|err| format!("Failed to build message: {}", err))?;

                        SmtpClientBuilder::new(
                            config.crash_report_smtp_server.as_ref(),
                            config.crash_report_smtp_port,
                        )
                        .credentials((
                            config.crash_report_email.as_ref(),
                            config.crash_report_email_password.as_ref(),
                        ))
                        .connect()
                        .await
                        .map_err(|err| format!("Failed to connect to SMTP server: {:?}", err))?
                        .send(message)
                        .await
                        .map_err(|err| format!("Failed to send message: {:?}", err))?;

                        found_cr = true;
                        println!("Crash report {} sent", filename);
                    }
                }
            }

            if found_cr == true {
                fs::remove_dir_all(&src_path)
                    .map_err(|err| format!("Failed to remove dir: {}", err))?;
                fs::create_dir(&src_path)
                    .map_err(|err| format!("Failed to create dir: {}", err))?;
                println!("cr folder cleaned");
            }
        }
        Err(err) => {
            if err.kind() == std::io::ErrorKind::NotFound {
                println!("No crash reports found");
            } else {
                return Err(format!("Failed to read dir: {}", err));
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn download_and_update_cmd(window: WebviewWindow, url: &str) -> Result<(), String> {
    let buffer = download_archive(url, |total, downloaded| {
        let _ = window.emit(
            "UPDATE_PROGRESS",
            UpdateProgress {
                total_bytes: total,
                downloaded,
                url: url.to_string(),
                total_files: 0,
                processed_files: 0,
                current_file: "".to_string(),
            },
        );
    })
    .await
    .or_else(|err| Err(format!("Failed to download archive: {}", err)))?;

    let mut ar = Archive::new(&buffer[..]);
    let mut iter = ar.entries().or(Err("Failed to get entries"))?;
    let mut copied_ar = Archive::new(&buffer[..]);
    let entries: Vec<Result<Entry<&[u8]>, io::Error>> = copied_ar
        .entries()
        .or(Err("Failed to get entries"))?
        .collect();
    let count = entries.len() as u16;
    let mut processed_files = 0;
    let mut update_processing_progress = |current_file: &str| {
        processed_files += 1;
        let _ = window.emit(
            "UPDATE_PROGRESS",
            UpdateProgress {
                total_bytes: buffer.len() as u64,
                downloaded: buffer.len() as u64,
                url: url.to_string(),
                total_files: count,
                processed_files,
                current_file: current_file.to_string(),
            },
        );
    };

    let mountpoint = find_mountpoint("Skytraxx").ok_or("Skytraxx not found")?;
    // handle single file hack
    if count == 1 {
        let entry = iter.next().unwrap().or(Err("Failed to get entry"))?;
        let path = entry.path().or(Err("Failed to get entry path"))?;
        let device_path = format!("{}/{}", mountpoint, path.to_str().unwrap());
        extract_single_file(entry, &device_path, |processed| {
            let _ = window.emit(
                "UPDATE_PROGRESS",
                UpdateProgress {
                    total_bytes: buffer.len() as u64,
                    downloaded: buffer.len() as u64,
                    url: url.to_string(),
                    total_files: 100,
                    processed_files: processed,
                    current_file: "".to_string(),
                },
            );
        })
        .map_err(|err| format!("Failed to extract single file: {}", err))?;

        return Ok(());
    }

    for item in iter {
        let mut entry = item.or(Err("Failed to get entry"))?;
        let path = entry.path().or(Err("Failed to get entry path"))?;
        let device_path = format!("{}/{}", mountpoint, path.to_str().unwrap());
        if let Some(ext) = path.extension() {
            if ext == "oab" || ext == "owb" || ext == "otb" || ext == "oob" {
                let mut device_file = match File::open(&device_path) {
                    Ok(f) => f,
                    Err(err) => {
                        if err.kind() == std::io::ErrorKind::NotFound {
                            entry
                                .unpack(&device_path)
                                .or_else(|err| Err(err.to_string()))?;

                            let path = entry.path().or(Err("Failed to get entry path"))?;
                            update_processing_progress(path.to_str().unwrap());
                            continue;
                        }

                        return Err(err.to_string());
                    }
                };

                // if file is smaller than 12 bytes just copy it
                if device_file.metadata().unwrap().len() < 12 {
                    entry
                        .unpack(&device_path)
                        .or_else(|err| Err(err.to_string()))?;

                    let path = entry.path().or(Err("Failed to get entry path"))?;
                    update_processing_progress(path.to_str().unwrap());
                    continue;
                }

                let mut device_buffer = [0; 12];
                device_file
                    .read_exact(&mut device_buffer)
                    .or(Err("Failed to read device file"))?;

                let mut check_buffer = [0; 12];
                entry
                    .read_exact(&mut check_buffer)
                    .or(Err("Failed to read file"))?;

                if check_buffer != device_buffer {
                    let mut rest: Vec<u8> = vec![];
                    entry
                        .read_to_end(&mut rest)
                        .or(Err("Failed to read file"))?;

                    let mut all = Vec::from(check_buffer);
                    all.append(&mut rest);

                    match fs::write(&device_path, &all) {
                        Ok(_) => {
                            println!("Updated {}", device_path)
                        }
                        Err(err) => {
                            return Err(err.to_string());
                        }
                    }
                }
            } else if ext == "xlb" {
                let mut buffer = [0; 36];
                entry
                    .read_exact(&mut buffer)
                    .or(Err("Failed to read file"))?;
                let new_sw = String::from_utf8_lossy(&buffer[24..]).to_string();
                let di = get_skytraxx_device().or(Err("Failed to get device info"))?;

                let device_built_num = u64::from_str_radix(&di.software_version, 10)
                    .or(Err("Failed to parse device built number"))?;
                let new_sw_built_num =
                    u64::from_str_radix(&new_sw, 10).or(Err("Failed to parse new built number"))?;

                if new_sw_built_num > device_built_num {
                    let mut rest: Vec<u8> = vec![];
                    entry
                        .read_to_end(&mut rest)
                        .or(Err("Failed to read file"))?;

                    let mut all = Vec::from(buffer);
                    all.append(&mut rest);

                    match fs::write(&device_path, &all) {
                        Ok(_) => {
                            println!("Copied new update {}", device_path)
                        }
                        Err(err) => {
                            return Err(err.to_string());
                        }
                    }
                }
            } else {
                if !Path::new(&device_path).exists() {
                    match entry.unpack(format!("{}/{}", mountpoint, path.to_str().unwrap())) {
                        Ok(_) => {
                            println!("Updated {}", device_path);
                        }
                        Err(err) => {
                            if err.kind() == std::io::ErrorKind::NotFound {
                                let path = Path::new(&device_path);
                                let prefix = path.parent().unwrap();
                                fs::create_dir_all(prefix).or(Err("Failed to create dir"))?;

                                entry
                                    .unpack(&device_path)
                                    .or_else(|err| Err(err.to_string()))?;
                            } else {
                                return Err(err.to_string());
                            }
                        }
                    }
                } else {
                    let mut entry_buf = vec![];
                    entry
                        .read_to_end(&mut entry_buf)
                        .map_err(|err| format!("Failed to read entry: {}", err))?;

                    let device_buf = fs::read(&device_path)
                        .map_err(|err| format!("Failed to read device file: {}", err))?;

                    if entry_buf != device_buf {
                        fs::write(&device_path, &entry_buf)
                            .map_err(|err| format!("Failed to write device file: {}", err))?;

                        println!("Updated {}", device_path);
                    }
                }
            }
        } else {
            // otherwise probably a directory
            let path = entry.path().or(Err("Failed to get entry path"))?;
            fs::create_dir_all(format!("{}/{}", mountpoint, path.to_str().unwrap()))
                .map_err(|err| format!("Failed to create dir: {}", err))?;
        }
        let path = entry.path().or(Err("Failed to get entry path"))?;
        update_processing_progress(path.to_str().unwrap());
    }

    Ok(())
}

fn extract_single_file(
    mut entry: Entry<'_, &[u8]>,
    device_path: &str,
    on_progress: impl Fn(u16),
) -> Result<(), String> {
    // Handle single file, emit progress for each chunk
    let device_path_cp = Path::new(device_path);
    let prefix = device_path_cp.parent().unwrap();
    fs::create_dir_all(prefix).map_err(|err| format!("Failed to create dir: {}", err))?;
    let mut file_processed_bytes = 0;
    let mut chunk = vec![0; 32768]; // Buffer to read chunks
    let mut file =
        File::create(&device_path).map_err(|err| format!("Failed to create file: {}", err))?;
    let file_size = entry.header().size().unwrap_or(0);
    loop {
        let bytes_read = match entry.read(&mut chunk) {
            Ok(0) => break, // EOF reached
            Ok(n) => n,     // Successfully read `n` bytes
            Err(err) => return Err(format!("Failed to read entry: {}", err).into()), // Handle the error properly
        };

        file.write_all(&chunk[..bytes_read])
            .or(Err("Failed to write chunk"))?;
        // Flush all pending writes to the underlying device
        let _ = match file.sync_all() {
            Ok(_) => Ok(()),
            Err(e) => Err(e),
        };
        file_processed_bytes += bytes_read as u64;
        on_progress((file_processed_bytes * 100 / file_size) as u16);
    }

    Ok(())
}

async fn download_archive(
    url: &str,
    mut on_update: impl FnMut(u64, u64),
) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .or(Err("Failed to download archive"))?;

    let total = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();

    let mut downloaded = 0;
    while let Some(chunk) = stream.try_next().await.or(Err("Failed to get chunk"))? {
        buffer.write_all(&chunk).or(Err("Failed to write chunk"))?;
        downloaded += chunk.len() as u64;
        on_update(total, downloaded);
    }

    Ok(buffer)
}

#[tauri::command]
fn get_skytraxx_device_cmd() -> FrontendResult<DeviceInfo> {
    match get_skytraxx_device() {
        Ok(device) => FrontendResult::result(device),
        Err(err) => FrontendResult::error(err),
    }
}

#[tauri::command]
fn is_running_on_main_volume_cmd() -> Result<bool, String> {
    let exe_path = env::current_exe().map_err(|e| e.to_string())?;
    // If the path does not start with `/Volumes`, it's likely the main volume
    Ok(!exe_path.starts_with("/Volumes"))
}

#[tauri::command]
async fn fetch_app_installer_version_cmd(url: String) -> Result<String, String> {
    match reqwest::get(&url).await {
        Ok(response) => {
            if response.status().is_success() {
                let server_version = response
                    .text()
                    .await
                    .map_err(|err| format!("Failed to read response text: {}", err.to_string()))?;
                return Ok(server_version);
            }

            Err(format!(
                "Failed to fetch version info: {}",
                response.status().to_string()
            ))
        }
        Err(err) => Err(format!("Failed to fetch version info: {}", err)),
    }
}

fn get_skytraxx_device() -> Result<DeviceInfo, String> {
    let dict = get_device_info().or_else(|err| Err(err))?;

    let device_name = dict.get("hw").ok_or("device_name not found")?;

    let software_version = match dict.get("sw") {
        Some(sw) => sw.to_string().replace("build-", ""),
        None => return Err("software_version not found".to_string()),
    };

    Ok(DeviceInfo {
        device_name: device_name.to_string(),
        software_version,
    })
}

fn get_device_info() -> Result<HashMap<String, String>, String> {
    let mountpoint = match find_mountpoint("Skytraxx") {
        Some(m) => m,
        None => {
            return Err("Skytraxx not found".to_string());
        }
    };

    let sys_file_content = fs::read_to_string(format!("{}/.sys/hwsw.info", mountpoint))
        .or(Err("Failed to read file"))?;

    Ok(parse_lines(&sys_file_content))
}

fn find_mountpoint(vol_name: &str) -> Option<String> {
    let disks = Disks::new_with_refreshed_list();

    for disk in disks.iter() {
        if disk.name().eq_ignore_ascii_case(vol_name) {
            match disk.mount_point().to_str() {
                Some(mountpoint) => return Some(mountpoint.to_string()),
                None => return None,
            }
        }
    }

    None
}

fn parse_lines(file_content: &str) -> HashMap<String, String> {
    let mut dict: HashMap<String, String> = HashMap::new();

    for line in file_content.lines() {
        let parts: Vec<&str> = line.split('=').collect();
        if parts.len() == 2 {
            let key = parts[0].to_string();
            let value = parts[1].to_string().replace('"', "");
            dict.insert(key, value);
        }
    }

    dict
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_lines() {
        let file_content = "hw=\"Skytraxx 3.0\"\nsw=\"3.0.0\"";
        let dict = parse_lines(file_content);

        assert_eq!(dict.get("hw").unwrap(), "Skytraxx 3.0");
        assert_eq!(dict.get("sw").unwrap(), "3.0.0");
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct DeviceInfo {
    device_name: String,
    software_version: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct FrontendResult<T> {
    error: String,
    result: Option<T>,
}

impl<T> FrontendResult<T> {
    fn error(error: String) -> Self {
        FrontendResult {
            error,
            result: None,
        }
    }

    fn result(result: T) -> Self {
        FrontendResult {
            error: String::new(),
            result: Some(result),
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    url: String,
    total_bytes: u64,
    downloaded: u64,
    current_file: String,
    processed_files: u16,
    total_files: u16,
}
