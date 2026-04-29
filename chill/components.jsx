/* eslint-disable */
const { useState, useEffect } = React;

function Nav() {
  return (
    <header className="ml-nav">
      <a href="#top" className="ml-lock">
        <img src="assets/logo-mr-chill.png" alt="Mr Chill" />
        <span>Mr Chill</span>
      </a>
      <nav>
        <a href="#halves">在做什麼</a>
        <a href="#stack">工具櫃</a>
        <a href="#now">Now playing</a>
        <a href="#writing">森林筆記</a>
        <a href="#find">Find me</a>
      </nav>
    </header>
  );
}

function StatusPill() {
  const [i, setI] = useState(0);
  const states = [
    { dot: 'var(--moss)', label: 'In the forest · 搬石頭 · 07:12' },
    { dot: 'var(--bark)', label: 'Claude Code 寫專案 · 14:08' },
    { dot: 'var(--fern)', label: '陪虎鼻散步 · 17:30' },
    { dot: 'var(--ink)',  label: 'Gemini 生成奇怪的影片 · 22:04' },
  ];
  useEffect(() => {
    const t = setInterval(() => setI(x => (x + 1) % states.length), 2800);
    return () => clearInterval(t);
  }, []);
  const s = states[i];
  return (
    <div className="ml-status">
      <span className="ml-status-dot" style={{ background: s.dot }} />
      <span className="ml-status-label">{s.label}</span>
    </div>
  );
}

function Hero() {
  return (
    <section className="ml-hero" id="top">
      <StatusPill />
      <h1 className="ml-hero-title">
        <span className="ml-display">Hi, 我是</span><br />
        <span className="ml-bigname">Mr Chill</span>
      </h1>
      <p className="ml-hero-sub">
        我來自都市，現在住在竹山的森林裡。<br />
        一半時間在森林搬石頭、砍樹，<br />
        另一半在<u>玩 AI</u>，看一個人能放大到什麼程度。<br />
        <span className="ml-hero-aside">※ 不是專家，比較像個愛好者。每週翻車一次。</span>
      </p>
      <div className="ml-hero-foot">
        <a className="ml-btn ml-btn-primary" href="#halves">看我在做什麼 →</a>
        <a className="ml-btn ml-btn-ghost" href="#find">Find me</a>
      </div>
      <div className="ml-hero-stats">
        <div><b>6</b><span>年沒回都市</span></div>
        <div><b>10,000+</b><span>位住過的客人</span></div>
        <div><b>23</b><span>個還沒寫完的 prompt</span></div>
        <div><b>1</b><span>隻狗叫虎鼻</span></div>
      </div>
      <img src="assets/logo-mr-chill.png" alt="" className="ml-hero-mark" />
    </section>
  );
}

function Halves() {
  return (
    <section className="ml-halves" id="halves">
      <div className="ml-section-head">
        <div className="ml-eyebrow">A week, split in two</div>
        <h2 className="ml-h2">兩個地方，同一個人</h2>
      </div>
      <div className="ml-half-grid">
        <article className="ml-half ml-half-forest">
          <div className="ml-half-num">01 · IN THE FOREST</div>
          <div className="ml-eyebrow">In the forest</div>
          <h3 className="ml-half-title">在森林</h3>
          <p>
            經營一間包棟民宿，叫<b>靜謐森林屋</b>。<br />
            打掃現在交給員工，<br />
            我去搬石頭、砍樹、整地。
          </p>
          <ul className="ml-half-list">
            <li>靜謐森林屋主理人 · 第六年</li>
            <li>累積接待 10,000+ 位客人</li>
            <li>有員工幫忙鋪床洗杯子</li>
            <li>有一隻狗，叫虎鼻</li>
          </ul>
        </article>
        <article className="ml-half ml-half-ai">
          <div className="ml-half-num">02 · WITH THE MACHINES</div>
          <div className="ml-eyebrow">Playing with AI</div>
          <h3 className="ml-half-title">在 AI</h3>
          <p>
            把無聊的事丟給機器。<br />
            寫專案、生圖、剪影片、整理筆記，<br />
            然後省下時間去搬石頭。
          </p>
          <ul className="ml-half-list">
            <li>每天開 Claude Code 寫東西</li>
            <li>用 GPT、nano banana 搞設計、生圖</li>
            <li>用 Gemini 生影片逗自己笑</li>
            <li>NotebookLM 拿來學新東西</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

const STACK = [
  { name: 'Claude Code',  use: '每天打開的東西，寫專案和雜事',   since: '2024' },
  { name: 'GPT',          use: '搞設計、想點子、debug',          since: '2023' },
  { name: 'nano banana',  use: '生圖、做空間和包裝草稿',          since: '2025' },
  { name: 'Gemini',       use: '生成奇怪的影片，自己看了笑',      since: '2025' },
  { name: 'NotebookLM',   use: '把資料丟進去，當作家教',          since: '2024' },
  { name: 'Whisper.cpp',  use: '把森林裡的碎念變逐字稿',          since: '2025' },
];

function Stack() {
  return (
    <section className="ml-stack" id="stack">
      <div className="ml-section-head">
        <div className="ml-eyebrow">The stack · 工具櫃</div>
        <h2 className="ml-h2">每天打開的東西</h2>
      </div>
      <ul className="ml-stack-list">
        {STACK.map((t, i) => (
          <li key={i} className="ml-stack-item">
            <span className="ml-stack-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="ml-stack-name">{t.name}</span>
            <span className="ml-stack-use">{t.use}</span>
            <span className="ml-stack-since">since {t.since}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const NOW_ITEMS = [
  { tag: 'tool',    title: '用 AI 蓋二館 · 室內設計',         note: '把空間照丟進 GPT、nano banana 生圖，反覆改格局和材質。蓋實體之前先在螢幕上蓋一百次。' },
  { tag: 'tool',    title: 'Claude Code 重寫官網',             note: '把舊的官網整個翻掉，自己重寫一版。順便練手。' },
  { tag: 'try',     title: '寫會員系統 · 森林護照',           note: '想讓住過的人成為森林的一份子。蓋一本「森林護照」，記得他們上次住哪間、第幾次回來、虎鼻認不認得。' },
  { tag: 'writing', title: 'Whisper.cpp 把散步碎念變文章',     note: '在森林邊走邊講，回來餵進 Whisper，再丟給 Claude 整理。最大挑戰是常常忘了按錄音。' },
  { tag: 'try',     title: 'Gemini 生森林短片',                note: '純粹好玩。最近一支是讓 Amy 跳迷因舞，逗了自己一整個下午。' },
  { tag: 'broken',  title: 'AI 自動發文系統',                  note: '想讓它自己排程貼文、配圖、寫 caption。目前語氣常常不像我，正在調。下個月希望可以放手。' },
];

function NowPlaying() {
  return (
    <section className="ml-now" id="now">
      <div className="ml-section-head">
        <div className="ml-eyebrow">Now playing · 最近在玩的</div>
        <h2 className="ml-h2">不一定有用，但有趣</h2>
      </div>
      <ul className="ml-now-list">
        {NOW_ITEMS.map((it, i) => (
          <li key={i} className="ml-now-item">
            <span className={"ml-tag ml-tag-" + it.tag}>{it.tag}</span>
            <div>
              <div className="ml-now-title">{it.title}</div>
              <div className="ml-now-note">{it.note}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="ml-now-foot">
        <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-3)'}}>
          updated 04 / 28 · 下一個翻車中
        </span>
      </div>
    </section>
  );
}

const NOTES = [
  { date: '04 / 28',  text: '搬石頭搬了一整天。我發現重的不是石頭，是「想一次搬完」。一次搬一顆，森林就不累了。' },
  { date: '04 / 22',  text: '訊號斷了一整天，反而做完最多事。手機不響的時候，腦袋才有森林。' },
  { date: '04 / 14',  text: '寫會員系統寫到一半，停下來看虎鼻睡覺。最好的功能可能是「不打擾」。' },
];

function Notes() {
  return (
    <section className="ml-writing" id="writing">
      <div className="ml-section-head">
        <div className="ml-eyebrow">Field notes · 森林筆記</div>
        <h2 className="ml-h2">隨手記的事</h2>
      </div>
      <ul className="ml-note-list">
        {NOTES.map((n, i) => (
          <li key={i} className="ml-note">
            <span className="ml-note-date">{n.date}</span>
            <span className="ml-note-text">{n.text}</span>
          </li>
        ))}
      </ul>
      <div className="ml-note-foot">
        <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-3)'}}>
          一些當下覺得值得記下的小事 · 不定期更新
        </span>
      </div>
    </section>
  );
}

function FindMe() {
  return (
    <section className="ml-find" id="find">
      <div className="ml-find-card">
        <div className="ml-eyebrow">Find me</div>
        <h2 className="ml-find-title">想聊、想住、想看翻車，<br/>都歡迎。</h2>
        <div className="ml-find-grid">
          <a className="ml-find-link" href="https://www.lx-foresthouse.com/" target="_blank" rel="noopener">
            <span className="ml-find-key">01</span>
            <span className="ml-find-label">靜謐森林屋 · 竹山</span>
            <span className="ml-find-arrow">→</span>
          </a>
          <a className="ml-find-link" href="https://line.me/ti/p/1GLag1uNxu" target="_blank" rel="noopener">
            <span className="ml-find-key">02</span>
            <span className="ml-find-label">LINE · 找我聊</span>
            <span className="ml-find-arrow">→</span>
          </a>
          <a className="ml-find-link" href="https://www.instagram.com/mrchilltw" target="_blank" rel="noopener">
            <span className="ml-find-key">03</span>
            <span className="ml-find-label">Instagram · @mrchilltw</span>
            <span className="ml-find-arrow">→</span>
          </a>
          <a className="ml-find-link" href="https://www.instagram.com/best_forest_house/" target="_blank" rel="noopener">
            <span className="ml-find-key">04</span>
            <span className="ml-find-label">森林屋 IG · @best_forest_house</span>
            <span className="ml-find-arrow">→</span>
          </a>
        </div>
        <p className="ml-find-foot">
          訊息我會回，但不一定快。森林訊號看天氣，虎鼻有時候會擋著鍵盤。
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="ml-footer">
      <img src="assets/logo-mr-chill.png" alt="" />
      <span>Mr Chill · 一個住在竹山森林、每天玩 AI 的人 · 2026</span>
    </footer>
  );
}

function App() {
  return (
    <>
      <Nav />
      <Hero />
      <Halves />
      <Stack />
      <NowPlaying />
      <Notes />
      <FindMe />
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
