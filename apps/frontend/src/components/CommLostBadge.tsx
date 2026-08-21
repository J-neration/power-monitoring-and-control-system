type Props = {
  className?: string;
};

/** 모듈 상태와 별도. 마지막 텔레메트리 이후 통신이 끊긴 설치지점 표시 */
export default function CommLostBadge({ className = "" }: Props) {
  return (
    <span
      className={`comm-lost-badge ${className}`.trim()}
      title="텔레메트리 미수신 (10분 주기, 30분 이상 끊김). 모듈 상태는 마지막 수신 값입니다."
    >
      통신 끊김
    </span>
  );
}
