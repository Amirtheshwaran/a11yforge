import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_MODEL_CALLS_PER_RUN,
  DEFAULT_META_MODEL,
  META_API_BASE_URL,
  getMaxModelCallsPerRun,
  getMetaBaseUrl,
  getMetaModel,
  requireApiKey,
} from "./config.js";

describe("meta config", () => {
  it("defaults to the contributor model", () => {
    assert.equal(getMetaModel({}), DEFAULT_META_MODEL);
    assert.equal(DEFAULT_META_MODEL, "muse-spark-1.3-contributor");
  });

  it("allows the model override env", () => {
    assert.equal(
      getMetaModel({ A11YFORGE_META_MODEL: "other-model" }),
      "other-model",
    );
  });

  it("ignores a blank model override", () => {
    assert.equal(
      getMetaModel({ A11YFORGE_META_MODEL: "   " }),
      DEFAULT_META_MODEL,
    );
  });

  it("defaults to the Meta base URL", () => {
    assert.equal(getMetaBaseUrl({}), META_API_BASE_URL);
    assert.equal(META_API_BASE_URL, "https://api.meta.ai/v1");
    assert.equal(getMetaBaseUrl({ MODEL_BASE_URL: "   " }), META_API_BASE_URL);
  });

  it("allows an HTTPS base URL override and drops trailing slashes", () => {
    assert.equal(
      getMetaBaseUrl({ MODEL_BASE_URL: "https://models.example.test/v1/" }),
      "https://models.example.test/v1",
    );
  });

  it("rejects an unsafe base URL without repeating its value", () => {
    for (const value of [
      "not a url",
      "http://models.example.test/v1",
      "https://user:hidden-value@models.example.test/v1",
      "https://models.example.test/v1?token=hidden-value",
      "https://models.example.test/v1#hidden-value",
    ]) {
      assert.throws(
        () => getMetaBaseUrl({ MODEL_BASE_URL: value }),
        (error: Error) =>
          error.message.includes("MODEL_BASE_URL") &&
          !error.message.includes("hidden-value"),
      );
    }
  });

  it("defaults the per-run call budget to 1", () => {
    assert.equal(getMaxModelCallsPerRun({}), DEFAULT_MAX_MODEL_CALLS_PER_RUN);
    assert.equal(DEFAULT_MAX_MODEL_CALLS_PER_RUN, 1);
  });

  it("rejects a non-integer or non-positive call budget", () => {
    assert.throws(() =>
      getMaxModelCallsPerRun({ A11YFORGE_MAX_MODEL_CALLS_PER_RUN: "0" }),
    );
    assert.throws(() =>
      getMaxModelCallsPerRun({ A11YFORGE_MAX_MODEL_CALLS_PER_RUN: "many" }),
    );
    assert.throws(() =>
      getMaxModelCallsPerRun({ A11YFORGE_MAX_MODEL_CALLS_PER_RUN: "1.5" }),
    );
  });

  it("fails before any request when MODEL_API_KEY is missing", () => {
    assert.throws(() => requireApiKey({}), /MODEL_API_KEY/);
    assert.throws(() => requireApiKey({ MODEL_API_KEY: "" }), /MODEL_API_KEY/);
  });

  it("returns the key without exposing it in the error path", () => {
    assert.equal(requireApiKey({ MODEL_API_KEY: "k" }), "k");
  });
});
