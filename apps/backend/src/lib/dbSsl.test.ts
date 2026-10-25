import assert from "node:assert/strict";
import type { PeerCertificate } from "node:tls";
import { describe, it } from "node:test";
import { dbSslOptions } from "./dbSsl.js";

const RDS_HOST = "pmcs-dev-db.abc123.ap-northeast-2.rds.amazonaws.com";
const rdsCert = {
  subject: { CN: RDS_HOST },
  subjectaltname: `DNS:${RDS_HOST}`,
} as unknown as PeerCertificate;
const readFile = () => "CA";

describe("dbSslOptions", () => {
  it("leaves TLS to the connection string when no CA file is set", () => {
    assert.equal(dbSslOptions({}, readFile), undefined);
  });

  it("verifies against the CA file and the connected host by default", () => {
    const ssl = dbSslOptions({ DATABASE_SSL_CA_FILE: "/ca.pem" }, readFile);
    assert.equal(ssl?.ca, "CA");
    assert.equal(ssl?.rejectUnauthorized, true);
    assert.equal(ssl?.checkServerIdentity, undefined);
  });

  it("checks the RDS host name instead of the tunnel address when DATABASE_SSL_SERVERNAME is set", () => {
    const ssl = dbSslOptions(
      { DATABASE_SSL_CA_FILE: "/ca.pem", DATABASE_SSL_SERVERNAME: RDS_HOST },
      readFile,
    );
    assert.equal(ssl?.checkServerIdentity?.("127.0.0.1", rdsCert), undefined);

    const wrong = dbSslOptions(
      { DATABASE_SSL_CA_FILE: "/ca.pem", DATABASE_SSL_SERVERNAME: "other.example.com" },
      readFile,
    );
    assert.ok(wrong?.checkServerIdentity?.("127.0.0.1", rdsCert) instanceof Error);
  });
});
