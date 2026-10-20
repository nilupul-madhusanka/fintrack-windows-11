use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
}

impl AppError {
    pub fn validation(message: &str) -> Self {
        Self {
            code: "VALIDATION_ERROR",
            message: message.into(),
        }
    }
    pub fn storage() -> Self {
        Self { code: "DATABASE_ERROR", message: "Could not read or save local data. Please try again and check available disk space.".into() }
    }
}
impl From<sqlx::Error> for AppError {
    fn from(_: sqlx::Error) -> Self {
        Self::storage()
    }
}
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for AppError {}
pub type Result<T> = std::result::Result<T, AppError>;
