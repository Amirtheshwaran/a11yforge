import Link from "next/link";
import { SiteCheck } from "../components/site-check";

export default function Home(): React.JSX.Element {
  return <main className="product-home">
    <section className="product-intro" aria-labelledby="product-title">
      <div className="product-intro-copy">
        <p className="tour-eyebrow">ACCESSIBILITY, MADE VISIBLE</p>
        <h1 id="product-title">See where your website is hard to use.</h1>
        <p className="product-description">A11yForge tests your website in a real browser, shows where accessibility problems happen, and traces supported repairs from evidence to proof.</p>
        <div className="product-actions"><a className="product-primary-action" href="#check-site">Check my website <span aria-hidden="true">→</span></a><Link href="/console">Watch the demo <span aria-hidden="true">↗</span></Link></div>
        <p className="product-note">See the full repair story on the demo page, then explore your own website’s findings.</p>
      </div>
      <ol className="product-capabilities" aria-label="What A11yForge can do">
        <li><span aria-hidden="true">01</span><div><h2>Test real interactions.</h2><p>A real browser checks accessibility patterns and keyboard behavior.</p></div></li>
        <li><span aria-hidden="true">02</span><div><h2>Explore each problem.</h2><p>Move through measured issue locations in a 3D view of your website.</p></div></li>
        <li><span aria-hidden="true">03</span><div><h2>Connect the code.</h2><p>Trace findings into connected source code for supported repairs.</p></div></li>
        <li><span aria-hidden="true">04</span><div><h2>Check the repair.</h2><p>On supported targets, build and replay checks decide whether a repair can be accepted.</p></div></li>
      </ol>
    </section>
    <SiteCheck context="landing" />
  </main>;
}
