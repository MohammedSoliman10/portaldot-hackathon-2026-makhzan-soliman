#!/usr/bin/env node
/**
 * Deploy entry point. All logic lives in apps/makhzan/src/deploy.ts so the tests exercise the same
 * code. Network and key come from the environment; no key is ever accepted on argv.
 */
import { main } from "../apps/makhzan/src/deploy.ts";

process.exitCode = await main(process.argv.slice(2), process.env, (line) => console.log(line));
