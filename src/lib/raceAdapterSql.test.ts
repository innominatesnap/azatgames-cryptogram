import { describe, expect, it } from "vitest";
import adapterSql from "../../supabase/migrations/20261013210000_cryptogram_race_adapter.sql?raw";

/**
 * AZGB-108 (minigame-core CryptoGram adapter). The SQL itself can't run
 * here -- there's no Postgres test harness in this repo -- so this checks
 * the ACL/lockdown shape a review can't eyeball reliably. The migration's
 * own embedded VERIFY/simulation block (run by Leo, against real Postgres,
 * after apply) is the behavioral test for race_pick_quote and
 * check_mapping themselves, including the spoiler-exclusion logic.
 */

function functionBodies(sql: string): string[] {
  const bodies = sql.match(/create or replace function cryptogram\.\w+\([^)]*\)[\s\S]*?\$fn\$;/g) ?? [];
  expect(bodies).toHaveLength(2);
  return bodies;
}

describe("supabase/migrations/20261013210000_cryptogram_race_adapter.sql", () => {
  it("declares race_pick_quote and check_mapping, security definer with an empty search_path", () => {
    for (const name of ["race_pick_quote", "check_mapping"]) {
      expect(adapterSql).toContain(`create or replace function cryptogram.${name}(`);
    }
    for (const body of functionBodies(adapterSql)) {
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
    }
  });

  it("grants execute only to postgres and revokes public, anon, authenticated, service_role", () => {
    const grants = [...adapterSql.matchAll(/grant execute on function ([^;]+?) to (\w+);/g)];
    const revokes = [...adapterSql.matchAll(/revoke all on function ([^;]+?) from ([^;]+);/g)];
    expect(grants).toHaveLength(2);
    expect(revokes).toHaveLength(2);
    for (const grant of grants) {
      expect(grant[2]).toBe("postgres");
    }
    for (const revoke of revokes) {
      const roles = revoke[2]!.split(",").map((r) => r.trim());
      expect(roles.sort()).toEqual(["anon", "authenticated", "public", "service_role"].sort());
    }
  });

  it("never writes to cryptogram.puzzles or cryptogram.attempts outside the verify block", () => {
    const start = adapterSql.indexOf("begin;");
    const end = adapterSql.indexOf("commit;");
    const applySection = adapterSql.slice(start, end);
    expect(applySection).not.toMatch(/insert into cryptogram\.(puzzles|attempts)/);
    expect(applySection).not.toMatch(/update cryptogram\.(puzzles|attempts)/);
  });

  it("race_pick_quote excludes quotes used by a recent community daily puzzle, and an explicit exclude list", () => {
    const start = adapterSql.indexOf("select q.id, q.plain_text");
    const end = adapterSql.indexOf("order by pg_catalog.random()", start);
    const query = adapterSql.slice(start, end);
    expect(query).toContain("q.public_domain");
    expect(query).toContain("not (q.id = any (coalesce(exclude_quote_ids");
    expect(query).toContain("p.puzzle_date >= v_today - exclude_recent_days");
    expect(query).toContain("p.puzzle_date <= v_today");
  });

  it("check_mapping is a no-wrong-guesses-yet check, not a full-26-letter completeness check", () => {
    const start = adapterSql.indexOf("create or replace function cryptogram.check_mapping");
    const end = adapterSql.indexOf("$fn$;", start);
    const body = adapterSql.slice(start, end);
    // Must only ever compare entries the caller's mapping actually has
    // (`p_mapping ? pair.number`), never require every code_key entry to
    // be present -- see the file's header note on why a full-26 check
    // would make most quotes unsolvable.
    expect(body).toContain("p_mapping ? pair.number");
    expect(body).not.toMatch(/jsonb_object_keys\(p_mapping\)\s*=\s*26/);
  });
});
