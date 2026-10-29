import { useEffect, useRef } from "react";
import { Layers3, MessageSquare, ShieldCheck } from "lucide-react";

const features = [
  { icon: MessageSquare, title: "말하듯 조건 작성", description: "“화·목 저녁 봉천역 근처”처럼 일상 언어로 편하게 입력하세요." },
  { icon: ShieldCheck, title: "비공개 조건 입력", description: "참여자의 원문은 서로 공개하지 않아요. 주최자는 분석에 반영되지 않은 조건을 확인할 수 있어요." },
  { icon: Layers3, title: "최대 3개 시간 선택지", description: "우열 없는 시간 선택지에서 참석 인원과 방식을 비교하고, 실제 시작·종료 시간을 골라 확정해요." },
];

export function LandingStory() {
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const panels = Array.from(rootRef.current!.querySelectorAll<HTMLElement>(".story-panel"));
    const observer = new IntersectionObserver(entries => {
      const visible = new Set(entries.filter(entry => entry.isIntersecting && entry.intersectionRatio >= .3).map(entry => entry.target));
      // Stagger only cards entering together; a later mobile card starts immediately.
      panels.filter(panel => visible.has(panel)).forEach((panel, index) => {
        if (!media.matches) {
          panel.style.animationDelay = `${index * 180}ms`;
          panel.classList.add("story-entered");
        }
        observer.unobserve(panel);
      });
    }, { threshold: .3, rootMargin: "0px 0px -48px 0px" });
    // Content is visible before enhancement, on unsupported browsers and on failure.
    for (const panel of panels) observer.observe(panel);
    const reduce = () => { if (media.matches) panels.forEach(panel => panel.classList.remove("story-entered")); };
    media.addEventListener("change", reduce);
    return () => { observer.disconnect(); media.removeEventListener("change", reduce); };
  }, []);

  return <section className="story" ref={rootRef} aria-label="Meet me 주요 기능">
    <div className="story-panels">
      {features.map(({ icon: Icon, title, description }, index) => <article key={title} className="glass-card feature story-panel">
        <div className="story-label"><span className="story-icon"><Icon aria-hidden="true" /></span><span className="story-number" aria-hidden="true">0{index + 1}</span></div>
        <h2>{title}</h2><p>{description}</p>
      </article>)}
    </div>
  </section>;
}
