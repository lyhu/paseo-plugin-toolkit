import { expect, it } from "vitest";
import { moveHost, orderedHosts } from "./host-order";

it("keeps offline Hosts in saved order and appends newly connected Hosts", () => {
  const hosts = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(orderedHosts(hosts)).toEqual(hosts);
  expect(orderedHosts(hosts, ["b", "removed", "b", "a"])).toEqual([hosts[1], hosts[0], hosts[2]]);
  expect(moveHost(["a", "b", "c"], "a", "c", true)).toEqual(["b", "c", "a"]);
  expect(moveHost(["a", "b", "c"], "c", "a", false)).toEqual(["c", "a", "b"]);
  expect(moveHost(["a", "b"], "a", "a", false)).toEqual(["a", "b"]);
});
