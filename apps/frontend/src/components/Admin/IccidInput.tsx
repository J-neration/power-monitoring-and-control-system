"use client";

import { useLayoutEffect, useRef, type InputHTMLAttributes, type RefObject } from "react";

/** 공백·하이픈 등 구분자를 제거한 ICCID 원본 (영숫자만, 대문자) */
export function stripIccid(raw: string): string {
  return raw.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

/** 화면 표시용: 4자리마다 공백 (예: 8988 2280 6668 0834 4844) */
export function formatIccid(raw: string): string {
  return stripIccid(raw).replace(/(.{4})(?=.)/g, "$1 ");
}

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  /** 구분자 없는 ICCID 값 */
  value: string;
  /** 구분자 없는 ICCID 값으로 호출됨 */
  onChange: (value: string) => void;
  /** 바깥에서 focus() 등을 쓰기 위한 ref */
  inputRef?: RefObject<HTMLInputElement>;
};

/**
 * ICCID 입력칸 — 4자리씩 띄어서 보여주고, 값은 공백 없이 전달.
 * 중간을 수정해도 커서가 끝으로 튀지 않도록 위치를 보정한다.
 */
export default function IccidInput({ value, onChange, inputRef, ...rest }: Props) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  /** 다음 렌더 후 커서를 둘 위치 = "커서 앞에 있는 실제 문자 수" */
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const charsBefore = pendingCaret.current;
    if (!el || charsBefore === null) return;
    pendingCaret.current = null;
    // 표시 문자열에서 실제 문자 charsBefore개 뒤의 위치 찾기
    const shown = el.value;
    let pos = 0;
    let seen = 0;
    while (pos < shown.length && seen < charsBefore) {
      if (shown[pos] !== " ") seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  });

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      value={formatIccid(value)}
      onChange={(e) => {
        const el = e.target;
        const caret = el.selectionStart ?? el.value.length;
        let before = stripIccid(el.value.slice(0, caret)).length;
        let next = stripIccid(el.value);
        // 공백만 지워진 경우(Backspace가 띄어쓰기 위에서 눌림) → 그 앞 글자를 지움
        if (
          next === stripIccid(value) &&
          el.value.length < formatIccid(value).length &&
          before > 0
        ) {
          next = next.slice(0, before - 1) + next.slice(before);
          before -= 1;
        }
        pendingCaret.current = before;
        onChange(next);
      }}
    />
  );
}
