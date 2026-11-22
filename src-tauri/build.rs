fn main() {
    // Keep executable resources and the default window icon in sync with branding updates.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
