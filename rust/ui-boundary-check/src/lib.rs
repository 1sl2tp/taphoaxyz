//! Independent read-only Rust proof-of-concept for TAPHOA HTML boundaries.
//! This is not called by the deployed JavaScript/PWA.

/// Escapes text for HTML text nodes or double-quoted attribute values.
/// The canonical browser implementation remains escapeProductEditorValue.
pub fn escape_html_double_quoted(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '&' => result.push_str("&amp;"),
            '"' => result.push_str("&quot;"),
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            other => result.push(other),
        }
    }
    result
}

/// Accept only DG/DT plus 1-12 ASCII digits, matching the live read-only
/// order-ID display restriction. Not an authorization to access an order.
pub fn canonical_order_display_id(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    if !(3..=14).contains(&bytes.len()) {
        return None;
    }
    if !bytes[0].eq_ignore_ascii_case(&b'D')
        || !(bytes[1].eq_ignore_ascii_case(&b'G')
            || bytes[1].eq_ignore_ascii_case(&b'T'))
        || !bytes[2..].iter().all(u8::is_ascii_digit)
    {
        return None;
    }
    Some(raw.to_ascii_uppercase())
}

#[cfg(test)]
mod tests {
    use super::*;


    /// The same scenarios are executed against the current JavaScript
    /// source via tests/rust-ui-boundary-parity-20261103.test.js.
    #[test]
    fn shared_production_js_parity_fixtures() {
        for line in include_str!("../fixtures/ui_cases.tsv").lines() {
            if line.starts_with('#') || line.is_empty() { continue; }
            let columns: Vec<&str> = line.split('|').collect();
            assert_eq!(columns.len(), 3, "invalid fixture columns: {line}");
            let kind = columns[0];
            let input = columns[1];
            let expected = columns[2];
            let actual = match kind {
                "escape" => escape_html_double_quoted(input),
                "order" => canonical_order_display_id(input)
                    .unwrap_or_else(|| "INVALID".to_string()),
                _ => panic!("unknown fixture kind {kind}"),
            };
            assert_eq!(actual, expected, "{kind} input={input:?}");
        }
    }

    #[test]
    fn neutral_html_is_unmodified() {
        assert_eq!(escape_html_double_quoted("Thu tiền C Sâm 975.000"), "Thu tiền C Sâm 975.000");
        assert_eq!(escape_html_double_quoted(""), "");
    }

    #[test]
    fn markup_and_double_quote_handlers_are_escaped() {
        assert_eq!(
            escape_html_double_quoted("<img src=x onerror=\"alert(1)\">&"),
            "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;"
        );
        assert_eq!(escape_html_double_quoted("<svg onload=\"x\"></svg>"),
            "&lt;svg onload=&quot;x&quot;&gt;&lt;/svg&gt;");
        assert_eq!(escape_html_double_quoted("&lt;"), "&amp;lt;");
    }

    #[test]
    fn order_ids_preserve_valid_ui_navigation_codes() {
        assert_eq!(canonical_order_display_id("DG156").as_deref(), Some("DG156"));
        assert_eq!(canonical_order_display_id("dt42").as_deref(), Some("DT42"));
        assert_eq!(
            canonical_order_display_id("dg123456789012").as_deref(),
            Some("DG123456789012")
        );
    }

    #[test]
    fn malicious_or_ambiguous_codes_fail_closed() {
        for raw in [
            "", "DG", "DT", "DX55", "DG1' onclick='alert(1)", "DG1\" x=\"x",
            "DG-2", "DT 11", " DG1", "DG1 ", "DG1234567890123", "DG１２",
            "<script>", "DG\n1", "DT.1",
        ] {
            assert_eq!(canonical_order_display_id(raw), None, "{raw:?}");
        }
    }
}
