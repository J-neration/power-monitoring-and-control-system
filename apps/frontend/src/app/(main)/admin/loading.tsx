export default function AdminLoading() {
  return (
    <main className="admin-iccid-page" aria-busy="true" aria-label="관리자 패널 로딩 중">
      <div className="admin-iccid-header">
        <div className="skel skel-text" style={{ width: 160, height: 28 }} />
        <div className="skel skel-text" style={{ width: 280, height: 16, marginTop: 8 }} />
      </div>
      <div className="skel skel-box" style={{ height: 220, borderRadius: 12 }} />
    </main>
  );
}
