#[cfg(windows)]
pub struct ProcessLimit(*mut std::ffi::c_void);
#[cfg(windows)]
impl ProcessLimit {
    pub fn attach(child: &std::process::Child) -> Result<Self, String> {
        use std::{ffi::c_void, os::windows::io::AsRawHandle};
        #[repr(C)]
        #[derive(Default)]
        struct Basic {
            process_time: i64,
            job_time: i64,
            flags: u32,
            min_work: usize,
            max_work: usize,
            active: u32,
            affinity: usize,
            priority: u32,
            scheduling: u32,
        }
        #[repr(C)]
        #[derive(Default)]
        struct Extended {
            basic: Basic,
            io: [u64; 6],
            process_memory: usize,
            job_memory: usize,
            peak_process: usize,
            peak_job: usize,
        }
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> *mut c_void;
            fn SetInformationJobObject(
                job: *mut c_void,
                class: i32,
                info: *const c_void,
                size: u32,
            ) -> i32;
            fn AssignProcessToJobObject(job: *mut c_void, process: *mut c_void) -> i32;
        }
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let guard = Self(handle);
        let mut limits = Extended::default();
        limits.basic.flags = 0x100 | 0x2000;
        limits.process_memory = 2 * 1024 * 1024 * 1024;
        if unsafe {
            SetInformationJobObject(
                handle,
                9,
                &limits as *const _ as *const c_void,
                std::mem::size_of::<Extended>() as u32,
            )
        } == 0
            || unsafe { AssignProcessToJobObject(handle, child.as_raw_handle()) } == 0
        {
            return Err(format!(
                "Não foi possível limitar o processo Blender: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(guard)
    }
}
#[cfg(windows)]
impl Drop for ProcessLimit {
    fn drop(&mut self) {
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
        }
        unsafe {
            CloseHandle(self.0);
        }
    }
}
#[cfg(not(windows))]
pub struct ProcessLimit;
#[cfg(not(windows))]
impl ProcessLimit {
    pub fn attach(_: &std::process::Child) -> Result<Self, String> {
        Err("Conversão precisa de limite de processo implementado para esta plataforma".into())
    }
}
