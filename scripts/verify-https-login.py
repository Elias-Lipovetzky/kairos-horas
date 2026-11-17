#!/usr/bin/env python3
"""Verify a real HTTPS session without writing credentials/cookies to disk or logs."""

import getpass
import http.cookiejar
from http.cookies import SimpleCookie
import json
import sys
import urllib.error
import urllib.request


def main():
    base = "https://kairoshoras.com/api"
    email = input("Existing Kairos account email: ").strip()
    password = getpass.getpass("Password (not saved): ")
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def request(path, body=None):
        headers = {"X-Kairos-Client": "web"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(base + path, headers=headers,
                                     data=json.dumps(body).encode() if body is not None else None)
        return opener.open(req, timeout=20)

    try:
        with request("/login", {"email": email, "password": password}) as response:
            cookie = SimpleCookie()
            cookie.load(response.headers.get("Set-Cookie", ""))
            session = cookie.get("kairos")
            if not session or not session["secure"] or not session["httponly"]:
                raise RuntimeError("Expected a Secure, HttpOnly session cookie")
            if session["samesite"].lower() != "strict":
                raise RuntimeError("Expected SameSite=Strict")
            response.read()
        password = None
        with request("/me") as response:
            user = json.load(response)
        if user.get("email", "").lower() != email.lower():
            raise RuntimeError("Session identity does not match")
        print("Verified: trusted HTTPS, login, authenticated session, Secure/HttpOnly/SameSite=Strict cookie.")
    finally:
        if any(c.name == "kairos" for c in jar):
            try:
                request("/logout", {}).close()
            except Exception:
                pass


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print(f"Login check failed: HTTP {error.code}. HTTPS configuration remains active.", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
