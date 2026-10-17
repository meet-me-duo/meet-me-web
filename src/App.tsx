import { Link, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import RoomPage from "./pages/RoomPage";
import { AccountBoundary, AccountControls, AuthCallback } from "./auth/AccountBoundary";
import { LoginGate, AccountArchive } from "./auth/AccountViews";
import { getSessionVersion } from "./auth/session";
import { useAccountSession } from "./auth/useAccount";
import { MeetMeLogo } from "./components/MeetMeLogo";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="Meet me 홈">
            <MeetMeLogo />
            <span><strong>Meet me</strong><small>스마트 일정 조율</small></span>
          </Link>
          <nav className="account-navigation"><Link to="/account/rooms">내가 만든 모임</Link><Link to="/login">로그인</Link><AccountControls /></nav>
        </div>
      </header>
      <main>{children}</main>
      <footer>© 2026 Meet me · 다른 사람의 일정은 공개되지 않아요.</footer>
    </div>
  );
}

function AccountRoomsRoute() { return useAccountSession() ? <AccountArchive /> : <LoginGate returnTo="/account/rooms" />; }

export default function App() {
  useAccountSession();
  return (
    <AccountBoundary><Shell>
      <Routes key={getSessionVersion()}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginGate />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/account/rooms" element={<AccountRoomsRoute />} />
        <Route path="/create" element={<LandingPage key="create" creating />} />
        <Route path="/rooms/:inviteCode" element={<RoomPage />} />
        <Route path="*" element={<div className="center-state"><h1>페이지를 찾을 수 없어요</h1><Link className="button primary" to="/">홈으로 돌아가기</Link></div>} />
      </Routes>
    </Shell></AccountBoundary>
  );
}
