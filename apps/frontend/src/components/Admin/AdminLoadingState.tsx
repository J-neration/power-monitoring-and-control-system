type Props = {
  label?: string;
};

/** Admin shell 콘텐츠 영역용 로딩 (사이드바는 layout에서 유지) */
export default function AdminLoadingState({
  label = "불러오는 중…",
}: Props) {
  return (
    <div className="admin-loading" aria-busy="true" aria-label={label}>
      <span className="admin-loading-spinner" aria-hidden />
      <span className="admin-loading-label">{label}</span>
    </div>
  );
}
