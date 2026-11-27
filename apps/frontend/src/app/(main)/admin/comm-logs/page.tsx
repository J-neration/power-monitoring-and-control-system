import AdminCommLogPanel from "../../../../components/Admin/AdminCommLogPanel";

/** HMI ↔ 서버 통신 로그. 데이터는 패널이 클라이언트에서 불러온다. */
export default function AdminCommLogsPage() {
  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">통신 로그</h1>
        <p className="admin-iccid-sub">
          관리자 전용 · HMI가 서버로 보낸 데이터와 서버의 답장을 시간순으로 보여줍니다. 데이터가 안 들어오거나 이상할 때 확인하세요.
        </p>
      </div>
      <AdminCommLogPanel />
    </main>
  );
}
