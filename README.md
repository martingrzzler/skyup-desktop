# Skytraxx Desktop App

## Installation

1. Rust
2. Node.js

## Development

1. Clone the repository
2. Add a `config.rs` file for the smpt config under `src-tauri/src` to send crash reports to the developer.

```rust
use serde::Deserialize;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppCfg {
    pub crash_report_email: String,
    pub crash_report_email_password: String,
    pub crash_report_smtp_server: String,
    pub crash_report_smtp_port: u16,
}

impl Default for AppCfg {
    fn default() -> Self {
        AppCfg {
            crash_report_email: "".to_string(),
            crash_report_email_password: "".to_string(),
            crash_report_smtp_server: "".to_string(),
            crash_report_smtp_port: 465,
        }
    }
}
```

4. Run `npm install`
5. Run `npm run tauri dev`

## Build

Tauri does not support cross-compiling yet, so you need to build the app on the target platform.
Set environment variables for the signing the app. Note: This is not the Apple Signing process.

```bash
export TAURI_SIGNING_PRIVATE_KEY="Path or content of your private key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
```

### MACOS

Build for both Apple Silicon and Intel

```bash
npm run tauri build -- --target universal-apple-darwin
```

### WINDOWS

```bash
npm run tauri build
```

### Linux

```bash
npm run tauri build
```
