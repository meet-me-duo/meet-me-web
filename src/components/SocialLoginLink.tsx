import type { ComponentProps } from "react";

const assets = {
  google: { src: "/brands/google-g.svg", width: 20, height: 20, label: "Google로 로그인" },
  kakao: { src: "/brands/kakao-login.svg", width: 224, height: 46, label: "카카오 로그인" },
};

export function SocialLoginLink({ provider, label, href, onClick, tabIndex, pending = false, ...props }: Omit<ComponentProps<"a">, "children" | "className"> & {
  provider: keyof typeof assets;
  label: string;
  pending?: boolean;
}) {
  const asset = assets[provider];
  const disabled = props["aria-disabled"] === true || props["aria-disabled"] === "true";
  return <a className={`social-login social-login--${provider}`} aria-label={label} {...props} data-pending={pending || undefined}
    // Keep the native destination during pending: React commits before the anchor's default action.
    href={disabled && !pending ? undefined : href} role={disabled ? "link" : props.role} tabIndex={disabled ? -1 : tabIndex}
    onClick={event => { if (disabled) { event.preventDefault(); return; } onClick?.(event); }}>
    {provider === "google" ? <span className="gsi-material-button">
      <span className="gsi-material-button-state" aria-hidden="true" />
      <span className="gsi-material-button-content-wrapper">
        <span className="gsi-material-button-icon"><img src={asset.src} width={asset.width} height={asset.height} alt="" aria-hidden="true" /></span>
        <span className="gsi-material-button-contents">Google로 로그인</span>
        <span style={{ display: "none" }}>Google로 로그인</span>
      </span>
    </span> : <span className="kakao-login-surface"><img src={asset.src} width={asset.width} height={asset.height} alt={asset.label} /><span className="social-login-state" aria-hidden="true" /></span>}
  </a>;
}
