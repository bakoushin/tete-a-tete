import { generateIdentity, type Identity } from "@tat/core";
import { idbDel, idbGet, idbSet } from "./idb";

/**
 * Everything on this device is scoped to the connected wallet address, so switching accounts in
 * the wallet switches identity: each wallet has its own R key, name and remembered contacts.
 */
let activeWallet: string | null = null;

export function setActiveWallet(address: string | null | undefined) {
  activeWallet = address ? address.toLowerCase() : null;
}

function scope(): string {
  if (!activeWallet) throw new Error("no wallet connected");
  return activeWallet;
}

const identityKey = () => `identity:${scope()}`;
const nameKey = () => `tat:name:${scope()}`;
const contactsKey = () => `tat:contacts:${scope()}`;

export async function loadIdentity(): Promise<Identity | null> {
  try {
    return (await idbGet<Identity>(identityKey())) ?? null;
  } catch {
    return null;
  }
}

/** Generates a fresh R for the active wallet and replaces the stored one. The old key is gone for good. */
export async function createIdentity(): Promise<Identity> {
  const id = await generateIdentity(true);
  await idbSet(identityKey(), id);
  return id;
}

export async function deleteIdentity() {
  await idbDel(identityKey());
}

export function loadOwnName(): string | null {
  try {
    return localStorage.getItem(nameKey());
  } catch {
    return null;
  }
}

export function saveOwnName(name: string | null) {
  try {
    if (name) localStorage.setItem(nameKey(), name);
    else localStorage.removeItem(nameKey());
  } catch {}
}

export function loadContacts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(contactsKey()) || "[]");
  } catch {
    return [];
  }
}

export function setContactRemembered(name: string, remembered: boolean) {
  const set = new Set(loadContacts());
  if (remembered) set.add(name);
  else set.delete(name);
  try {
    localStorage.setItem(contactsKey(), JSON.stringify([...set]));
  } catch {}
}
