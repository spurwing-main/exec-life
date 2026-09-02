import { afterEach, describe, expect, it, vi } from "vitest";
import { firstNameFrom, initFirstName } from "./first-name.js";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("firstNameFrom", () => {
  it("takes the first word of a full name", () => {
    expect(firstNameFrom("Alexander Ogden")).toBe("Alexander");
    expect(firstNameFrom("Oliver Adamkiewicz")).toBe("Oliver");
  });

  it("survives the untidy values a CMS actually holds", () => {
    expect(firstNameFrom("  Rachel   Jones  ")).toBe("Rachel");
    expect(firstNameFrom("")).toBe("");
    expect(firstNameFrom(null)).toBe("");
    expect(firstNameFrom(undefined)).toBe("");
  });
});

describe("initFirstName", () => {
  it("fills the token from the page's bound name element", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">Oliver Adamkiewicz</h1>
      <h2 id="head">Written by {{first}}</h2>`;

    initFirstName();

    expect(document.querySelector("#head").textContent).toBe("Written by Oliver");
  });

  it("keeps the possessive when there is a name", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">Alexander Ogden</h1>
      <p id="copy">Read {{first}}'s latest insights and blogs.</p>`;

    initFirstName();

    expect(document.querySelector("#copy").textContent).toBe(
      "Read Alexander's latest insights and blogs.",
    );
  });

  it("replaces every occurrence, not just the first", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">Rachel Jones</h1>
      <p id="copy">{{first}} writes, {{first}} advises, ask {{first}}.</p>`;

    initFirstName();

    expect(document.querySelector("#copy").textContent).toBe(
      "Rachel writes, Rachel advises, ask Rachel.",
    );
  });

  it("tolerates whitespace inside the token", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">Megan Douglas</h1>
      <p id="copy">Written by {{ first }}</p>`;

    initFirstName();

    expect(document.querySelector("#copy").textContent).toBe("Written by Megan");
  });

  it("prefers an explicit data-first-name over the heading", () => {
    document.body.innerHTML = `
      <span data-first-name="Vicky"></span>
      <h1 class="team-page_name">Victoria Jolly</h1>
      <p id="copy">Ask {{first}}.</p>`;

    initFirstName();

    expect(document.querySelector("#copy").textContent).toBe("Ask Vicky.");
  });

  it("drops the token AND its dangling possessive when no name is found", () => {
    document.body.innerHTML = `<p id="copy">Read {{first}}'s latest insights.</p>`;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    initFirstName();

    const text = document.querySelector("#copy").textContent;
    expect(text).not.toContain("{{first}}");
    expect(text).not.toContain("'s");
    expect(text).toBe("Read latest insights.");
  });

  it("warns when tokens are present but no name element is", () => {
    document.body.innerHTML = `<p>Written by {{first}}</p>`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    initFirstName();

    expect(warn).toHaveBeenCalled();
  });

  it("does not warn on a page with no tokens at all", () => {
    document.body.innerHTML = `<h1 class="team-page_name">Claire Sohal</h1><p>Plain copy.</p>`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    initFirstName();

    expect(warn).not.toHaveBeenCalled();
  });

  it("writes text, never markup", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">&lt;img src=x onerror=alert(1)&gt; Ogden</h1>
      <p id="copy">Written by {{first}}</p>`;

    initFirstName();

    const copy = document.querySelector("#copy");
    expect(copy.querySelector("img")).toBeNull();
    expect(copy.textContent).toContain("<img");
  });

  it("fills tokens in aria-label and title", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">Matthew Wellman</h1>
      <a id="link" aria-label="Follow {{first}} on LinkedIn" title="{{first}}'s profile">Follow</a>`;

    initFirstName();

    const link = document.querySelector("#link");
    expect(link.getAttribute("aria-label")).toBe("Follow Matthew on LinkedIn");
    expect(link.getAttribute("title")).toBe("Matthew's profile");
  });

  it("leaves an unrelated token alone", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">Jade MacKenzie</h1>
      <p id="copy">{{last}} and {{first}}</p>`;

    initFirstName();

    expect(document.querySelector("#copy").textContent).toBe("{{last}} and Jade");
  });

  it("scopes to the root it is given", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">Jade MacKenzie</h1>
      <div id="inside"><p>In: {{first}}</p></div>
      <p id="outside">Out: {{first}}</p>`;

    initFirstName(document.querySelector("#inside"));

    expect(document.querySelector("#inside").textContent).toBe("In: Jade");
    expect(document.querySelector("#outside").textContent).toBe("Out: {{first}}");
  });
});

// The exact strings authored on the Team Members template, against a real
// name from the CMS. If someone edits the copy in the Designer and forgets
// the possessive, this is where it shows up.
describe("the real Team Members copy", () => {
  it("fills the section heading", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">Oliver Adamkiewicz</h1>
      <h2 id="head">Written by {{first}}</h2>`;

    initFirstName();

    expect(document.querySelector("#head").textContent).toBe("Written by Oliver");
  });

  it("fills the intro paragraph", () => {
    document.body.innerHTML = `
      <h1 class="team-page_name">Oliver Adamkiewicz</h1>
      <p id="intro">Read {{first}}'s latest insights and blogs on protecting your business, your people and your future.</p>`;

    initFirstName();

    expect(document.querySelector("#intro").textContent).toBe(
      "Read Oliver's latest insights and blogs on protecting your business, your people and your future.",
    );
  });
});
