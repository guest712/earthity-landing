const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  let payload;
  try {
    if (!event.body || !String(event.body).trim()) {
      return jsonResponse(400, { error: "Request body is empty" });
    }
    payload = JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const emailRaw =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!emailRaw || !EMAIL_RE.test(emailRaw)) {
    return jsonResponse(400, { error: "Please enter a valid email address" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("submit-email: missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return jsonResponse(500, {
      error: "Service temporarily unavailable. Please try again later.",
    });
  }

  const baseUrl = supabaseUrl.replace(/\/$/, "");

  try {
    // Plain INSERT: duplicate email hits UNIQUE on `email` → 409 from PostgREST.
    const url = `${baseUrl}/rest/v1/subscribers`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email: emailRaw }),
    });

    if (response.status === 409) {
      return jsonResponse(200, { alreadySubscribed: true });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("submit-email: Supabase error", response.status, errText);
      return jsonResponse(500, {
        error: "Could not save. Please try again later.",
      });
    }

    return jsonResponse(200, { alreadySubscribed: false });
  } catch (err) {
    console.error("submit-email:", err);
    return jsonResponse(500, {
      error: "Could not save. Please try again later.",
    });
  }
};
