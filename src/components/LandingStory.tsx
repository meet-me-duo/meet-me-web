import { useEffect, useRef, useState } from "react";
import { Layers3, MessageSquare, ShieldCheck } from "lucide-react";

const features = [
  { icon: MessageSquare, title: "말하듯 조건 작성", description: "“화·목 저녁 봉천역 근처”처럼 일상 언어로 편하게 입력하세요." },
  { icon: ShieldCheck, title: "비공개 조건 입력", description: "참여자의 원문은 서로 공개하지 않아요. 주최자는 분석에 반영되지 않은 조건을 확인할 수 있어요." },
  { icon: Layers3, title: "최대 3개 시간 선택지", description: "우열 없는 시간 선택지에서 참석 인원과 방식을 비교하고, 실제 시작·종료 시간을 골라 확정해요." },
];

export function LandingStory() {
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = rootRef.current!;
    const stage = stageRef.current!;
    if (typeof requestAnimationFrame !== "function" || !CSS.supports("position", "sticky")) return;
    const media = matchMedia("(prefers-reduced-motion: no-preference) and (min-height: 540px)");
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      root.dataset.enhanced = media.matches ? "true" : "false";
      const panels = root.querySelector<HTMLElement>(".story-panels")!;
      const fits = Array.from(panels.children).every((panel) => {
        const copy = panel.querySelector<HTMLElement>(".story-copy")!;
        const art = panel.querySelector<HTMLElement>(".story-art")!;
        return copy.scrollHeight + (innerWidth <= 780 ? art.offsetHeight + 16 : 0) <= panels.clientHeight;
      });
      if (!media.matches || !fits) {
        root.dataset.enhanced = "false";
        setEnhanced(false);
        return;
      }
      const start = root.getBoundingClientRect().top + scrollY - Number.parseFloat(getComputedStyle(stage).top);
      const distance = Math.max(1, root.offsetHeight - stage.offsetHeight);
      const progress = Math.max(0, Math.min(1, (scrollY - start) / distance));
      root.style.setProperty("--story-progress", String(progress));
      setActive(Math.min(2, Math.floor(progress * 3)));
      setEnhanced(true);
    };
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
      delete root.dataset.enhanced;
    };
  }, []);

  const select = (index: number) => {
    const root = rootRef.current!, stage = stageRef.current!;
    const start = root.getBoundingClientRect().top + scrollY - Number.parseFloat(getComputedStyle(stage).top);
    window.scrollTo({ top: start + (root.offsetHeight - stage.offsetHeight) * ((index + .25) / 3), behavior: "instant" });
  };

  return <section className="story" ref={rootRef} aria-label="Meet me 주요 기능">
    <div className="story-stage" ref={stageRef}>
      <div className="story-backdrop" aria-hidden="true"><i /><i /><i /></div>
      <nav className="story-nav" aria-label="기능 설명 단계">
        {features.map((feature, index) => <button key={feature.title} type="button" aria-current={active === index ? "step" : undefined} onClick={() => select(index)}><b>{index + 1}</b><span>{feature.title}</span></button>)}
      </nav>
      <div className="story-panels">
        {features.map(({ icon: Icon, title, description }, index) => <article key={title} className="glass-card feature story-panel" data-current={active === index} aria-hidden={enhanced && active !== index ? true : undefined} inert={enhanced && active !== index}>
          <div className="story-copy"><div className="story-label"><span className="story-icon"><Icon /></span><span className="story-count" aria-hidden="true">0{index + 1} / 03</span></div><h2>{title}</h2><p>{description}</p></div>
          <div className={`story-art story-art-${index + 1}`} aria-hidden="true">
            <span className="story-symbol"><Icon /></span>
            {index === 0 && <div className="story-quote">“화·목 저녁 봉천역 근처”</div>}
            {index === 1 && <div className="story-private"><MessageSquare /><ShieldCheck /><MessageSquare /></div>}
            {index === 2 && <div className="story-plans"><span>시간 선택지 1</span><span>시간 선택지 2</span><span>시간 선택지 3</span></div>}
          </div>
        </article>)}
      </div>
      <div className="story-progress" aria-hidden="true"><span /></div>
    </div>
  </section>;
}
