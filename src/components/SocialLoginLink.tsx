import type { ComponentProps } from "react";

const assets = {
  google: { src: "/brands/google-signin.png", width: 540, height: 120, label: "Google로 로그인" },
  kakao: { src: "/brands/kakao-login.svg", width: 224, height: 46, label: "카카오 로그인" },
};

export function SocialLoginLink({ provider, label, ...props }: Omit<ComponentProps<"a">, "children" | "className"> & {
  provider: keyof typeof assets;
  label: string;
}) {
  const asset = assets[provider];
  return <a className="social-login" aria-label={label} {...props}><img src={asset.src} width={asset.width} height={asset.height} alt={asset.label} /></a>;
}
