# Contributing to Canvas Shell

Contributions are welcome, and bug reports, fixes and tests especially. Canvas
is a work in progress, and the parts that get used are the parts that get good.

## No CLA for this repository

Canvas Shell is AGPL-3.0-or-later and nothing else. No commercial licence is
offered for it, so there is nothing to sublicense and no contributor licence
agreement to sign. Your contribution is licensed under the AGPL, the same
licence the rest of this repository carries, and that is the end of it.

All we ask for is a **Developer Certificate of Origin** sign-off. Add a
`Signed-off-by` line to each commit, which `git commit -s` does for you:

```
git commit -s -m "fix: handle empty context path"
```

That line certifies that you wrote the patch, or otherwise have the right to
submit it under the AGPL. See [developercertificate.org](https://developercertificate.org/).
It grants nothing beyond the AGPL and it does not let anyone relicense your work.

> Some other Canvas repositories are dual-licensed and do ask contributors to
> sign a CLA: the server runtime, SynapsD, StoreD, NeuralD and the web UI. This
> one does not, and there is no plan to change that.

## Practical notes

- **Discuss large changes first.** Open an issue before a big refactor.
- **Match the surrounding code.** Comment density and naming vary by module, so
  follow the file you are in.
- **Open the pull request against this repository**, not against
  `canvas-server`. Canvas components are separate repositories under
  [github.com/canvas-ui](https://github.com/canvas-ui).
- **Leave the source notices alone.** Where this client surfaces the Canvas
  version and source URL, that is the section 13 source offer and it needs to
  stay.

## Reporting security issues

Please do not open a public issue for a vulnerability. Email **security@augmentd.eu**.

Questions about contributing: **contrib@augmentd.eu**
