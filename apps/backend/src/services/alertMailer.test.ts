import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDevAlertNotice, isDevAlertSite } from "./alertMailer.js";

const mail = {
  subject: "[PQMS] 프라임 R&D 연구소 시작실 — 통신 끊김",
  text: "PQMS 설비 알림",
  html: "<body><p>PQMS 설비 알림</p></body>",
};

describe("isDevAlertSite", () => {
  it("treats the dev host as a test site", () => {
    assert.equal(isDevAlertSite({ FRONTEND_ORIGIN: "https://app-dev.pqms.co.kr", NODE_ENV: "production" }), true);
  });

  it("leaves production hosts unmarked", () => {
    assert.equal(
      isDevAlertSite({ FRONTEND_ORIGIN: "https://pqms.co.kr,https://app.pqms.co.kr", NODE_ENV: "production" }),
      false,
    );
  });

  it("marks a local development process", () => {
    assert.equal(isDevAlertSite({ NODE_ENV: "development", FRONTEND_ORIGIN: "http://localhost:3000" }), true);
  });
});

describe("applyDevAlertNotice", () => {
  it("prefixes the subject and body only for dev", () => {
    const marked = applyDevAlertNotice(mail, { FRONTEND_ORIGIN: "https://app-dev.pqms.co.kr" });
    assert.equal(marked.subject, `[DEV 테스트] ${mail.subject}`);
    assert.match(marked.text, /^이 메일은 DEV 사이트에서 발송된 테스트용 알림입니다/);
    assert.match(marked.html ?? "", /<body><div[^>]*>이 메일은 DEV 사이트에서 발송된 테스트용 알림입니다/);
    assert.match(marked.html ?? "", /PQMS 설비 알림/);

    const prod = applyDevAlertNotice(mail, {
      FRONTEND_ORIGIN: "https://pqms.co.kr,https://app.pqms.co.kr",
      NODE_ENV: "production",
    });
    assert.equal(prod.subject, mail.subject);
    assert.equal(prod.text, mail.text);
    assert.equal(prod.html, mail.html);
  });
});
