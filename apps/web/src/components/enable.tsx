"use client";

import { useState } from "react";
import { useEnsName } from "wagmi";
import { sepolia } from "wagmi/chains";
import type { Hex, WalletClient } from "viem";
import { bytesEqual, type Identity } from "@tat/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createIdentity } from "@/lib/identity";
import { normalizeName, publishRdvKey, readNameOwner, readRdvKey } from "@/lib/ens";

type Step = "idle" | "checking" | "generating" | "publishing" | "done";

export function EnableCard({
  identity,
  wallet,
  address,
  onEnabled,
}: {
  identity: Identity | null;
  wallet: WalletClient | null;
  address?: Hex;
  onEnabled: (id: Identity, name: string) => void;
}) {
  const { data: primaryName, isLoading: primaryLoading } = useEnsName({ address, chainId: sepolia.id, query: { enabled: !!address } });
  // Identity = the connected wallet's primary name (reverse record).
  const name = primaryName ?? "";
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<Hex | null>(null);

  const enable = async () => {
    setError(null);
    try {
      const n = normalizeName(name);
      setStep("checking");
      const owner = await readNameOwner(n);
      if (!owner || !address || owner.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`${n} is not owned by the connected wallet. Connect the wallet that owns it.`);
      }
      let id = identity;
      if (!id) {
        setStep("generating");
        id = await createIdentity();
      }
      const published = await readRdvKey(n);
      if (!published || !bytesEqual(published, id.publicKey)) {
        if (!wallet) throw new Error("connect a wallet first");
        setStep("publishing");
        setTx(await publishRdvKey(wallet, n, id.publicKey));
      }
      setStep("done");
      onEnabled(id, n);
    } catch (e) {
      setError((e as Error).message.split("\n")[0] ?? "failed");
      setStep("idle");
    }
  };

  const busy = step !== "idle" && step !== "done";
  const busyLabel =
    step === "idle" || step === "done" ? "Enable" : step === "checking" ? "Checking…" : step === "generating" ? "Generating key…" : "Confirm in wallet…";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enable Tête-à-tête</CardTitle>
        <CardDescription>Enable private encrypted chat. Requires sending a transaction to ENS registry.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!address ? (
          <p className="text-sm text-muted-foreground">Connect the wallet that owns your Sepolia ENS name.</p>
        ) : primaryLoading ? (
          <p className="text-sm text-muted-foreground">Looking up your primary name…</p>
        ) : primaryName ? (
          <div>
            <Button onClick={enable} disabled={busy}>
              {busyLabel}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This wallet has no primary ENS name. Tête-à-tête identifies you by it, so register a name and set it as primary at{" "}
            <a className="underline" href="https://app.ens.dev" target="_blank" rel="noreferrer">
              app.ens.dev
            </a>{" "}
            (Sepolia), then come back.
          </p>
        )}
        {tx && (
          <p className="text-xs text-muted-foreground">
            Published:{" "}
            <a className="underline" href={`https://sepolia.etherscan.io/tx/${tx}`} target="_blank" rel="noreferrer">
              {tx.slice(0, 10)}…
            </a>
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
