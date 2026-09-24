# Goggles (g5s)

A 3D viewer for a Kubernetes cluster. Namespaces become nebulae, workloads and
pods orbit inside them, containers show up when you get close enough. You fly
around with the mouse and move the selection with the arrow keys.

It is read-only. g5s lists objects, it never writes anything back to the
cluster.

> Study project. I mostly wrote it to learn how far agentic coding goes with
> the current Claude and Antigravity tooling, so treat it as an experiment, not
> as an ops tool.

## Run it

```sh
g5s
```

No flags needed. It listens on `http://localhost:8080` and the page asks you
which kubeconfig context to use.

If you'd rather not point it at a real cluster, there are JSON fixtures in
`fixtures/`:

```sh
g5s --snapshot fixtures/medium.json
```

`small.json` is hand-written and covers every structural case, `medium.json`
is ~200 pods and `large.json` ~500, both generated, and the large one is what I
use to see when the framerate starts hurting.

You can also dump your own cluster and replay it later:

```sh
g5s --dump fixtures/mine.json
g5s --snapshot fixtures/mine.json
```

## Flags

| Flag | Default | What it does |
|---|---|---|
| `--addr` | `:8080` | listen address |
| `--cluster` | | read the live cluster |
| `--kubeconfig` | `$KUBECONFIG`, else `~/.kube/config` | kubeconfig path |
| `--context` | current context | context to use |
| `--list-contexts` | | print the contexts and exit |
| `--snapshot` | | load a JSON snapshot instead of a cluster |
| `--dump` | | write a snapshot and exit |
| `--poll` | `5s` | refresh interval, `0` disables it |
| `--version` | | print the version and exit |

Any of `--cluster`, `--kubeconfig`, `--context`, `--dump` or `--list-contexts`
connects straight away and skips the context picker in the browser.

## Keys

| Key | |
|---|---|
| arrows | move between neighboring objects |
| `Q` / `W` | dive into the selection / come back up |
| `E` / `O` | network links / ownership links |
| `/` | focus the filter bar |
| `?` | help overlay (also lists the shapes) |
| `Esc` | up one level, or close what's open |

The filter bar takes a few tokens on top of plain fuzzy name matching:
`ns:prod`, `k:pod`, `h:error`, `node:w1`, `l:app=web`, `cpu:>500`, `mem:>80%`,
and `!` in front of any of them to negate it. `?` documents them all.

You can also group by kind, node or health instead of by namespace, which
re-lays out the whole scene.

## Build

Go 1.26+, Node 22+ and [Task](https://taskfile.dev). There's a
[Nix flake](flake.nix) if you'd rather not install them yourself
(`direnv allow`, or `nix develop`).

```sh
task run                            # build the frontend, embed it, start g5s
task run -- --snapshot fixtures/small.json
task test                           # go test + vitest
task check                          # vet, gofmt, tsc
```

The frontend is a Vite/TypeScript app built into `backend/internal/webui/dist`
and embedded in the binary with `go:embed`, so a release is a single file.

## Layout

```
backend/internal/acquire   kubeconfig, client-go calls, snapshots
backend/internal/domain    the graph model (nodes, edges, health, metrics)
backend/internal/poll      cached model, refreshed on a ticker
backend/internal/server    HTTP API, plus a websocket for live logs
frontend/src/layout        where each object ends up in 3D
frontend/src/render        Three.js meshes, labels, edges, starfield
frontend/src/nav           selection and keyboard navigation
frontend/src/ui            panels, filter bar, help, popups
```

## Things to know

- Refreshes are a full re-read on a timer, not a watch. `--poll 0` turns it off.
- Pod CPU and memory come from metrics-server. Without it, the numbers are
  simply absent.
- Resource types your RBAC denies are skipped and logged, the rest still loads.
- Only `namespace` grouping keeps the ownership cascade (Deployment → RS → Pod).
  The other modes lay each group out flat.

## Releases

Tag and push, CI builds the binaries with
[GoReleaser](.goreleaser.yaml):

```sh
git tag vX.Y.Z
git push --tags
```

## License

[MIT](LICENSE)
