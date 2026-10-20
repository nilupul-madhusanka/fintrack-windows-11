use crate::error::{AppError, Result};
use chrono::{Datelike, NaiveDate};

pub const MAX_AMOUNT: i64 = 99_999_999_999_999;

pub fn parse_money(text: &str, opening_balance: bool) -> Result<i64> {
    let text = text.trim();
    if text.len() > 18 {
        return Err(AppError::validation("Amount is too large."));
    }
    let (negative, unsigned) = if opening_balance && text.starts_with('-') {
        (true, &text[1..])
    } else {
        (false, text)
    };
    let parts: Vec<_> = unsigned.split('.').collect();
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    if parts.is_empty()
        || parts.len() > 2
        || !digits(parts[0])
        || (parts.len() == 2 && (!digits(parts[1]) || parts[1].len() > 2))
    {
        return Err(AppError::validation(
            "Enter an amount like 1250.50, with at most two decimal places and no commas.",
        ));
    }
    let whole = parts[0]
        .parse::<i64>()
        .map_err(|_| AppError::validation("Amount is too large."))?;
    let fraction = if parts.len() == 1 {
        0
    } else {
        parts[1].parse::<i64>().unwrap_or(0) * if parts[1].len() == 1 { 10 } else { 1 }
    };
    let minor = whole
        .checked_mul(100)
        .and_then(|x| x.checked_add(fraction))
        .filter(|x| *x <= MAX_AMOUNT)
        .ok_or_else(|| AppError::validation("Maximum amount is LKR 999,999,999,999.99."))?;
    if !opening_balance && minor == 0 {
        return Err(AppError::validation(
            "Transaction amounts must be greater than zero.",
        ));
    }
    Ok(if negative { -minor } else { minor })
}

pub fn date(text: &str) -> Result<NaiveDate> {
    let parsed = NaiveDate::parse_from_str(text, "%Y-%m-%d")
        .map_err(|_| AppError::validation("Choose a valid calendar date."))?;
    if text.len() != 10
        || parsed.format("%Y-%m-%d").to_string() != text
        || !(1..=9998).contains(&parsed.year())
    {
        return Err(AppError::validation(
            "Date must be YYYY-MM-DD, in years 0001 to 9998.",
        ));
    }
    Ok(parsed)
}

pub fn period_bounds(period: &str) -> Result<(String, String)> {
    if period.len() != 7 {
        return Err(AppError::validation("Select a valid month."));
    }
    let start = date(&format!("{period}-01"))?;
    let (year, month) = if start.month() == 12 {
        (start.year() + 1, 1)
    } else {
        (start.year(), start.month() + 1)
    };
    let end = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| AppError::validation("Select a valid month."))?;
    Ok((start.to_string(), end.to_string()))
}

pub fn checked_minor(value: i128) -> Result<i64> {
    i64::try_from(value).map_err(|_| {
        AppError::validation("This entry would exceed the supported balance or summary range.")
    })
}

pub fn uuid(text: &str) -> Result<()> {
    uuid::Uuid::parse_str(text)
        .map_err(|_| AppError::validation("Select a valid account or category."))?;
    Ok(())
}

pub fn text(value: &str, max: usize, required: bool) -> Result<String> {
    let value = value.trim();
    if (required && value.is_empty()) || value.chars().count() > max || value.contains('\0') {
        return Err(AppError::validation(
            "A field is empty or exceeds its allowed length.",
        ));
    }
    Ok(value.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_amounts_and_limits() {
        for (input, expected) in [
            ("1250.50", 125050),
            ("0.01", 1),
            ("1.5", 150),
            (" 12 ", 1200),
            ("999999999999.99", MAX_AMOUNT),
        ] {
            assert_eq!(parse_money(input, false).unwrap(), expected);
        }
        assert_eq!(parse_money("-12.50", true).unwrap(), -1250);
        assert_eq!(parse_money("0.00", true).unwrap(), 0);
        for input in [
            "",
            "0",
            "-1",
            "+1",
            "1.234",
            "1.",
            ".5",
            "NaN",
            "1e3",
            "1,000",
            "١٢",
            "1000000000000",
            "9223372036854775807",
        ] {
            assert!(parse_money(input, false).is_err(), "{input}");
        }
    }
    #[test]
    fn real_calendar_and_half_open_months() {
        assert!(date("2026-02-31").is_err());
        assert!(date("2026-2-01").is_err());
        assert!(date("0000-01-01").is_err());
        assert!(date("2024-02-29").is_ok());
        assert_eq!(
            period_bounds("2026-12").unwrap(),
            ("2026-12-01".into(), "2027-01-01".into())
        );
        assert!(period_bounds("2026-13").is_err());
        assert!(checked_minor(i64::MAX as i128 + 1).is_err());
    }
}
