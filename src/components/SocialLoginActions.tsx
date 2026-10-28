import { useId } from "react";
import { SocialLoginLink } from "./SocialLoginLink";
import { useSocialLoginNavigation } from "./useSocialLoginNavigation";

const providers = ["google", "kakao"] as const;
const names = { google: "Google", kakao: "Kakao" };

/** Native OAuth navigation only. No preflight fetch, credentials or client auth SDK. */
export function SocialLoginActions({ apiBase, onBeforeNavigate, recovery = false }: {
  apiBase: string;
  onBeforeNavigate: () => void;
  recovery?: boolean;
}) {
  const { pending, error, start } = useSocialLoginNavigation();
  const feedbackId = useId();

  return <div className={`social-login-actions${recovery ? " social-login-actions--recovery" : ""}`}>
    <div className="account-actions social-actions" role="group" aria-label="로그인 방법">
      {providers.map(provider => <SocialLoginLink key={provider} provider={provider}
        label={recovery ? `같은 계정으로 ${names[provider]} 로그인` : `${names[provider]}로 로그인`}
        href={`${apiBase}/api/auth/${provider}/start`} aria-disabled={pending ? true : undefined}
        pending={pending !== null} aria-busy={pending === provider || undefined}
        aria-describedby={feedbackId} onClick={event => start(event, provider, onBeforeNavigate)} />)}
    </div>
    <p id={feedbackId} className="social-login-feedback" role={error ? "alert" : "status"}>
      {pending ? `${names[pending]} 로그인 화면으로 이동 중…` : error}
    </p>
  </div>;
}
