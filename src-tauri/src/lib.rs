#[cfg_attr(mobile, tauri::mobile_entry_point)]
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Debug)]
struct FolderWithNodeModules {
  path: String,
  name: String,
  size: String,
  size_in_bytes: u64, // 添加字节大小字段
}

#[derive(Serialize, Deserialize, Debug)]
struct ScanResult {
  folders: Vec<FolderWithNodeModules>,
  total_size: String,
}

fn get_size_as_string(size_in_bytes: u64) -> String {
  if size_in_bytes > 1024 * 1024 * 1024 {
    format!(
      "{:.2} GB",
      size_in_bytes as f64 / (1024.0 * 1024.0 * 1024.0)
    )
  } else {
    format!("{:.2} MB", size_in_bytes as f64 / (1024.0 * 1024.0))
  }
}

fn get_folder_size(path: &Path) -> u64 {
  WalkDir::new(path)
    .min_depth(1)
    .into_iter()
    .filter_map(|entry| entry.ok())
    .filter_map(|entry| entry.metadata().ok())
    .filter(|metadata| metadata.is_file())
    .fold(0, |acc, m| acc + m.len())
}

fn contains_multiple_node_modules(path: &Path) -> bool {
  let path_str = path.to_string_lossy();
  path_str.matches("node_modules").count() > 1
}

#[command]
async fn scan_node_modules(base_dir: String, calculate_size: bool) -> Result<ScanResult, String> {
  println!("Scanning node_modules in {}", base_dir);

  let base_path = Path::new(&base_dir);
  let mut total_size: u64 = 0;
  let mut folders = Vec::new();

  for entry in WalkDir::new(base_path)
    .min_depth(1)
    .max_depth(3)
    .into_iter()
    .filter_map(|e| e.ok())
    .filter(|e| {
      e.path().is_dir()
        && e.file_name() == "node_modules"
        && !contains_multiple_node_modules(e.path())
    })
  {
    let path = entry.path();
    let size_in_bytes = if calculate_size {
      get_folder_size(path)
    } else {
      0
    };

    if size_in_bytes > 0 || !calculate_size {
      total_size += size_in_bytes;

      let relative_path = path
        .strip_prefix(base_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

      let parent_path = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

      let display_name = if parent_path.is_empty() {
        relative_path.clone()
      } else {
        format!(".../{}", parent_path)
      };

      folders.push(FolderWithNodeModules {
        path: path.to_string_lossy().to_string(),
        name: display_name,
        size: get_size_as_string(size_in_bytes),
        size_in_bytes, // 存储字节大小
      });
    }
  }

  // 使用已存储的字节大小进行排序
  folders.sort_by(|a, b| b.size_in_bytes.cmp(&a.size_in_bytes));

  Ok(ScanResult {
    folders,
    total_size: get_size_as_string(total_size),
  })
}

#[command]
async fn clean_node_modules(paths: Vec<String>) -> Result<(), String> {
  for path in paths {
    let path_buf = PathBuf::from(&path);
    if path_buf.exists() && path_buf.is_dir() {
      match fs::remove_dir_all(&path_buf) {
        Ok(_) => println!("Successfully removed: {}", path),
        Err(e) => println!("Failed to remove {}: {}", path, e),
      }
    }
  }
  Ok(())
}

pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      scan_node_modules,
      clean_node_modules
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
