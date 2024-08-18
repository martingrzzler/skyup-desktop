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

3. Run `npm install`
4. Run `npm run tauri dev`

## Build

Tauri does not support cross-compiling yet, so you need to build the app on the target platform.

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
