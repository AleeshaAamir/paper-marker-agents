import { useEffect, useRef, useState } from "react";

const BrandMark = ({ size = 18 }) => (
  <div className="brand-mark" aria-hidden="true">
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  </div>
);

export default function Landing({ onSignIn, onSignUp }) {
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setResourcesOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const scrollTo = (id) => (e) => {
    e.preventDefault();
    setResourcesOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <header className="site-nav">
        <div className="site-nav-brand"><BrandMark /><span className="gradient-text">Paper Marker</span></div>
        <nav className="site-nav-links">
          <a href="#home" className="active" onClick={scrollTo("home")}>Home</a>
          <a href="#how-it-works" onClick={scrollTo("how-it-works")}>How It Works</a>
          <div className={`nav-dropdown${resourcesOpen ? " open" : ""}`} ref={navRef}>
            <button className="nav-dropdown-trigger" onClick={() => setResourcesOpen((v) => !v)}>
              Resources <span className="chevron">&#9662;</span>
            </button>
            <div className="nav-dropdown-mega">
              <div className="mega-col">
                <div className="mega-col-label">The Agents</div>
                <a href="#agents" className="mega-item" onClick={scrollTo("agents")}>
                  <span className="mega-item-icon">&#128203;</span>
                  <span><b>Rubric Agent</b><small>Turns the marking scheme into structured criteria</small></span>
                </a>
                <a href="#agents" className="mega-item" onClick={scrollTo("agents")}>
                  <span className="mega-item-icon">&#9997;&#65039;</span>
                  <span><b>Solution Agent</b><small>Builds the reference answer to mark against</small></span>
                </a>
                <a href="#agents" className="mega-item" onClick={scrollTo("agents")}>
                  <span className="mega-item-icon">&#9878;&#65039;</span>
                  <span><b>Evaluation Agent</b><small>Scores the answer, quoting evidence for every mark</small></span>
                </a>
                <a href="#agents" className="mega-item" onClick={scrollTo("agents")}>
                  <span className="mega-item-icon">&#128269;</span>
                  <span><b>Critic Agent</b><small>Audits the marking for unsupported or hallucinated marks</small></span>
                </a>
              </div>
              <div className="mega-col">
                <div className="mega-col-label">Project Links</div>
                <a href="https://github.com/AleeshaAamir/paper-marker-agents" target="_blank" rel="noopener" className="mega-item mega-item-box">
                  <span className="mega-item-icon">&#128187;</span>
                  <span><b>GitHub Repository</b><small>Source code for the marking pipeline</small></span>
                </a>
                <a href="#faq" className="mega-item mega-item-box" onClick={scrollTo("faq")}>
                  <span className="mega-item-icon">&#10067;</span>
                  <span><b>FAQ</b><small>Scope, storage, and what's real vs. demo</small></span>
                </a>
              </div>
              <div className="mega-callout">
                <div className="mega-callout-icon"><BrandMark size={22} /></div>
                <b>About this project</b>
                <p>A final year project at Air University, built in collaboration with Intelligement.</p>
                <a href="#about" className="mega-callout-link" onClick={scrollTo("about")}>Read more &rarr;</a>
              </div>
            </div>
          </div>
          <a href="#about" onClick={scrollTo("about")}>About</a>
        </nav>
        <div className="site-nav-actions">
          <button className="nav-signin" onClick={onSignIn}>Sign In</button>
          <button className="primary nav-signup" onClick={onSignUp}>Sign Up</button>
        </div>
      </header>

      <main className="landing">
        <section className="hero" id="home">
          <div className="hero-copy">
            <div className="hero-eyebrow">Efficient &middot; Accurate &middot; Secure</div>
            <h1>AI-powered exam marking <span className="gradient-text">platform</span></h1>
            <p className="hero-sub">
              Paper Marker digitizes university exam evaluation end to end: a scanned
              answer sheet gets an anonymous UUID, four AI agents mark it against the
              rubric with quoted evidence, and a teacher reviews and approves the
              result before it's final.
            </p>
            <div className="hero-actions">
              <button className="primary hero-btn" onClick={onSignUp}>Get Started</button>
              <button className="hero-btn hero-btn-ghost" onClick={onSignIn}>Sign In</button>
            </div>
            <div className="hero-tags">
              <span>&#10003; Anonymous UUID per paper</span>
              <span>&#10003; Evidence-quoted marking</span>
              <span>&#10003; Human-in-the-loop review</span>
            </div>
          </div>
          <div className="hero-shot-wrap">
            <div className="browser-chrome">
              <span className="dot dot-red"></span><span className="dot dot-amber"></span><span className="dot dot-green"></span>
              <span className="browser-chrome-title">Marking Queue &mdash; live</span>
            </div>
            <img src="/hero-preview.png" alt="Paper Marker AI marking review screen" className="hero-shot" />
          </div>
        </section>

        <section className="feature-strip" id="how-it-works">
          <div className="feature-card">
            <div className="feature-num">1</div>
            <h3>Upload</h3>
            <p>Admin uploads a scanned answer sheet (photo or PDF). The page is OCR'd and an Anonymous UUID is generated automatically.</p>
          </div>
          <div className="feature-card">
            <div className="feature-num">2</div>
            <h3>AI Marks It</h3>
            <p id="agents">Four agents run in sequence &mdash; Rubric, Solution, Evaluation, Critic &mdash; quoting the exact evidence for every mark, in Urdu or English.</p>
          </div>
          <div className="feature-card">
            <div className="feature-num">3</div>
            <h3>Teacher Reviews</h3>
            <p>Admin assigns the paper to a Teacher, who accepts, adjusts, or flags the AI's marking before it's final.</p>
          </div>
          <div className="feature-card">
            <div className="feature-num">4</div>
            <h3>Student Sees Result</h3>
            <p>Once reviewed, the student can sign in and see their score &mdash; nothing more, nothing less.</p>
          </div>
        </section>

        <section className="faq-section" id="faq">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-list">
            <div className="faq-item">
              <b>Is this the final production website?</b>
              <p>Yes for the module boundary - the AI Marking module's own web app is now genuinely React (frontend) + .NET Core (backend), calling the Python AI marking pipeline as a service, matching the team's scope doc.</p>
            </div>
            <div className="faq-item">
              <b>What languages does it support?</b>
              <p>English and Urdu, including a stricter OCR-confidence floor for Urdu to account for weaker handwriting recognition and model performance.</p>
            </div>
            <div className="faq-item">
              <b>Is the AI's mark final?</b>
              <p>No. Every AI-generated mark is reviewed by a Teacher, who can accept, adjust, or flag it before it counts &mdash; and a large adjustment automatically triggers second-marking.</p>
            </div>
            <div className="faq-item">
              <b>Where is the data stored?</b>
              <p>This demo keeps data in memory for the session. Persistent storage is a separate module's responsibility, planned on Supabase.</p>
            </div>
          </div>
        </section>

        <section className="about-strip" id="about">
          <p>Final year project &middot; Department of Computer Science, Air University Islamabad &middot; in collaboration with Intelligement</p>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-top">
          <div className="site-footer-brand"><BrandMark size={16} />Paper Marker</div>
          <nav className="site-footer-links">
            <a href="#how-it-works" onClick={scrollTo("how-it-works")}>How It Works</a>
            <a href="#agents" onClick={scrollTo("agents")}>The Agents</a>
            <a href="#faq" onClick={scrollTo("faq")}>FAQ</a>
            <a href="https://github.com/AleeshaAamir/paper-marker-agents" target="_blank" rel="noopener">GitHub</a>
          </nav>
        </div>
        <div className="site-footer-bottom">&copy; 2026 Paper Marker &middot; Final year project, Air University Islamabad</div>
      </footer>
    </>
  );
}
