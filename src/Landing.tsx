import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
import { PadPreview } from "./PadPreview";

export function Landing() {
  return (
    <div className="landing-page">
      <nav className="landing-nav" aria-label="Main">
        <Wordmark />
        <div>
          <a href="https://ryanpolasky.com">By Ryan Polasky</a>
          <ThemeToggle />
        </div>
      </nav>
      <main className="product-landing">
        <div className="product-intro">
          <div>
            <h1>
              Mock interviews,
              <br />
              in a shared editor.
            </h1>
            <p>
              Send a link. Write and run Python, C++ or Java in the same pad.
            </p>
          </div>
          <a className="primary new-pad" href="/new">
            New pad
          </a>
        </div>
        <PadPreview />
        <p className="landing-specs">
          Real compilation and execution. Shared stdin, output and interview
          timer.
        </p>
      </main>
      <footer className="landing-footer">
        <span>
          Free to use. Pads are deleted 24 hours after everyone leaves.
        </span>
      </footer>
    </div>
  );
}
