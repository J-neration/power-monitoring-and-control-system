import { redirect } from "next/navigation";
import InspectionPanel from "../../../components/Inspection/InspectionPanel";
import { getSessionUser } from "../../../lib/auth-server";

export default async function InspectionPage() {
  const user = await getSessionUser();
  // 출고검사 계정 전용. 관리자는 관리 > ICCID 화면을 쓴다.
  if (user?.role !== "INSPECTOR" || !user.siteId) redirect("/");

  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">출고검사 · ICCID 등록</h1>
        <p className="admin-iccid-sub">
          검사 현장 안에서만 등록·해제할 수 있습니다. 장비 제어·설정은 할 수 없습니다.
        </p>
      </div>
      <InspectionPanel siteId={user.siteId} />
    </main>
  );
}
