"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useWalletClient } from "wagmi";
import type { Hex } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PARENT_NAME, RESOLVER_ADDRESS } from "@/lib/config";
import { readNameOwner, readParentRegistryAndResolver, setNameResolver } from "@/lib/ens";

/** Operator page: point the parent name at RendezvousResolver (ENSv2 registry setResolver). */
export default function AdminPage() {
  const { address } = useAccount();
  const { connect, connectors } = useConnect();
  const { data: wallet } = useWalletClient();
  const [state, setState] = useState<{ owner: Hex | null; registry: Hex; resolver: Hex } | null>(null);
  const [tx, setTx] = useState<Hex | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([readNameOwner(PARENT_NAME), readParentRegistryAndResolver(PARENT_NAME)]).then(([owner, r]) =>
      setState({ owner, registry: r.registry, resolver: r.resolver }),
    );
  useEffect(() => {
    void load();
  }, []);

  const apply = async () => {
    if (!wallet) return;
    setBusy(true);
    setErr(null);
    try {
      setTx(await setNameResolver(wallet, PARENT_NAME, RESOLVER_ADDRESS));
      await load();
    } catch (e) {
      setErr((e as Error).message.split("\n")[0] ?? "failed");
    } finally {
      setBusy(false);
    }
  };

  const isOwner = !!address && !!state?.owner && address.toLowerCase() === state.owner.toLowerCase();
  const done = state?.resolver.toLowerCase() === RESOLVER_ADDRESS.toLowerCase();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Parent name setup</CardTitle>
          <CardDescription>
            Point <code>{PARENT_NAME}</code> at the RendezvousResolver so every secret subname resolves through the gateway (ENSv2 registry <code>setResolver</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-[130px_1fr] gap-y-1 font-mono text-xs break-all">
            <dt className="text-muted-foreground">owner</dt>
            <dd>{state?.owner ?? "…"}</dd>
            <dt className="text-muted-foreground">registry</dt>
            <dd>{state?.registry ?? "…"}</dd>
            <dt className="text-muted-foreground">current resolver</dt>
            <dd>{state?.resolver ?? "…"}</dd>
            <dt className="text-muted-foreground">target resolver</dt>
            <dd>{RESOLVER_ADDRESS}</dd>
          </dl>
          {done ? (
            <p className="text-green-600">Done: {PARENT_NAME} resolves through RendezvousResolver.</p>
          ) : !address ? (
            <Button onClick={() => connectors[0] && connect({ connector: connectors[0] })}>Connect the owner wallet</Button>
          ) : !isOwner ? (
            <p className="text-destructive">Connected wallet {address} does not own {PARENT_NAME}.</p>
          ) : (
            <Button onClick={apply} disabled={busy || !wallet}>
              {busy ? "Confirm in wallet…" : "Set resolver"}
            </Button>
          )}
          {tx && (
            <a className="underline" href={`https://sepolia.etherscan.io/tx/${tx}`} target="_blank" rel="noreferrer">
              tx {tx.slice(0, 12)}…
            </a>
          )}
          {err && <p className="text-destructive">{err}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
