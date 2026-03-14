"Custom ng_config without preserveSymlinks - for testing module resolution"

load("@jq.bzl//jq:jq.bzl", "jq")

# JQ expressions to update Angular project output paths from dist/* to projects/*/dist
# We do this to avoid mutating the files in the source tree, so that the native tooling without Bazel continues to work.
JQ_DIST_REPLACE_TSCONFIG = """
    .compilerOptions.paths |= if . then map_values(
      map(
        gsub("^dist/(?<p>.+)$"; "projects/"+.p+"/dist")
      )
    ) else {} end
"""

# Update paths in angular.json - WITHOUT adding preserveSymlinks
JQ_DIST_REPLACE_ANGULAR = """
(
  .projects | to_entries | map(
    if .value.projectType == "application" then
      .value.architect.build.options.outputPath = "./" + .value.root + "/dist"
    else
      .
    end
  ) | from_entries
) as $updated |
. * {projects: $updated}
"""

def ng_config_no_symlinks(name, **kwargs):
    jq(
        name = name + "_angular",
        srcs = ["angular.json"],
        filter = JQ_DIST_REPLACE_ANGULAR,
    )

    jq(
        name = name + "_tsconfig",
        srcs = ["tsconfig.json"],
        filter = JQ_DIST_REPLACE_TSCONFIG,
    )

    native.filegroup(
        name = name,
        srcs = [":" + name + "_angular", ":" + name + "_tsconfig"],
        **kwargs
    )
