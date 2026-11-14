#!/bin/sh

set -eu

main() {
	command=$(normalize_command "${1:-setup}")
	if [ "$#" -gt 0 ]; then
		shift
	fi

	run_command "$command" "$@"
}

run_command() {
	command=${1:?setup command is required}
	case "$command" in
	setup | local-dev) run_local_setup ;;
	prepare) run_prepare ;;
	hooks) run_hooks ;;
	pnpm) shift && run_pnpm "$@" ;;
	--help | -h) usage ;;
	*)
		echo "Unknown setup command: $command" >&2
		usage >&2
		exit 1
		;;
	esac
}

usage() {
	echo "Usage: sh scripts/setup.sh <command>"
	echo "Commands: setup, prepare, local-dev, hooks, pnpm, --hooks-only"
}

run_prepare() {
	is_ci && {
		echo "CI environment detected; skipping local hooks."
		return 0
	}

	has_git_worktree || {
		echo "No Git worktree detected; skipping local hooks."
		return 0
	}

	repo_root=$(git rev-parse --show-toplevel)
	git_dir=$(get_git_dir "$repo_root")
	hooks_dir="$git_dir/hooks"
	install_hooks "$repo_root" "$hooks_dir"
}

has_git_worktree() {
	git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

run_local_setup() {
	install_lint_tools
	run_hooks
	repo_root=$(git rev-parse --show-toplevel)
	run_setup "$repo_root"
	echo "Setup complete."
}

run_setup() {
	repo_root=${1:?repository root is required}
	cd "$repo_root"
	run_pnpm install --frozen-lockfile
	run_pnpm run validate
}

run_pnpm() {
	wanted_version=$(read_pnpm_version)
	use_current_pnpm "$wanted_version" && {
		pnpm "$@"
		return 0
	}

	run_pnpm_with_node "$wanted_version" "$@" && return 0
	npm exec --package "pnpm@$wanted_version" -- pnpm "$@"
}

run_pnpm_with_node() {
	wanted_version=${1:?pnpm version is required}
	shift
	node_path=$(node_bin_dir) || return 1
	PATH="$node_path:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" npm exec --package "pnpm@$wanted_version" -- pnpm "$@"
}

node_bin_dir() {
	node_version=$(read_node_version)
	has_command mise || return 1
	node_dir=$(mise where "node@$node_version")
	printf '%s/bin\n' "$node_dir"
}

read_node_version() {
	cat .node-version
}

use_current_pnpm() {
	wanted_version=${1:?pnpm version is required}
	current_version=$(current_pnpm_version) || return 1
	[ "$current_version" = "$wanted_version" ]
}

current_pnpm_version() {
	has_command pnpm || return 1
	pnpm --version 2>/dev/null
}

read_pnpm_version() {
	node -p "require('./package.json').packageManager.split('@')[1]"
}

run_hooks() {
	repo_root=$(git rev-parse --show-toplevel)
	git_dir=$(get_git_dir "$repo_root")
	hooks_dir="$git_dir/hooks"
	install_hooks "$repo_root" "$hooks_dir"
	lint_shell "$repo_root" "$hooks_dir"
	echo "Git hooks are up to date."
}

lint_shell() {
	repo_root=${1:?repository root is required}
	hooks_dir=${2:?hooks directory is required}
	shfmt -d "$repo_root/scripts/setup.sh"
	shellcheck -x -S warning "$repo_root/scripts/setup.sh" "$hooks_dir/pre-commit" "$hooks_dir/post-merge"
	shellcheck-legibility check --config "$repo_root/scripts/.shellcheck-legibility.toml" "$repo_root/scripts/setup.sh"
}

install_hooks() {
	repo_root=${1:?repository root is required}
	hooks_dir=${2:?hooks directory is required}
	mkdir -p "$hooks_dir"
	write_pre_commit_hook "$hooks_dir"
	write_post_merge_hook "$hooks_dir"
	chmod +x "$hooks_dir/pre-commit" "$hooks_dir/post-merge"
}

write_post_merge_hook() {
	hooks_dir=${1:?hooks directory is required}
	content=$(
		cat <<'HOOK'
#!/bin/sh

set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

exec sh scripts/setup.sh --hooks-only
HOOK
	)
	write_hook "$hooks_dir/post-merge" "$content"
}

write_pre_commit_hook() {
	hooks_dir=${1:?hooks directory is required}
	content=$(
		cat <<'HOOK'
#!/bin/sh

set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

./scripts/setup.sh pnpm run lint/session
./scripts/setup.sh pnpm run typecheck
./scripts/setup.sh pnpm run test
HOOK
	)
	write_hook "$hooks_dir/pre-commit" "$content"
}

write_hook() {
	path=${1:?hook path is required}
	content=${2:?hook content is required}

	hook_is_current "$path" "$content" && {
		echo "$path is up to date."
		return 0
	}

	status=$(hook_write_status "$path")

	printf '%s\n' "$content" >"$path"
	echo "$status $path."
}

hook_write_status() {
	path=${1:?hook path is required}
	[ -e "$path" ] || {
		echo "Created"
		return 0
	}

	echo "Updated"
}

hook_is_current() {
	path=${1:?hook path is required}
	content=${2:?hook content is required}
	[ -f "$path" ] || return 1
	[ "$(cat "$path")" = "$content" ]
}

get_git_dir() {
	repo_root=${1:?repository root is required}
	git_dir=$(git -C "$repo_root" rev-parse --git-dir)

	case "$git_dir" in
	/*) printf '%s\n' "$git_dir" ;;
	*) printf '%s/%s\n' "$repo_root" "$git_dir" ;;
	esac
}

install_lint_tools() {
	set --
	for lint_formula in shellcheck shfmt yowainwright/tap/shellcheck-legibility yowainwright/tap/fs-lint yowainwright/tap/src-lint yowainwright/tap/struct-lint; do
		has_command "${lint_formula##*/}" || set -- "$@" "$lint_formula"
	done
	[ "$#" -gt 0 ] || return 0
	printf 'Missing lint tools:\n'
	printf '  %s\n' "$@"
	has_command brew || {
		echo "Install Homebrew and add it to PATH, then rerun setup." >&2
		return 1
	}
	confirm_lint_install "$@"
	brew install "$@"
	verify_lint_tools "$@"
}

verify_lint_tools() {
	for lint_formula; do
		has_command "${lint_formula##*/}" || {
			echo "Installed $lint_formula, but ${lint_formula##*/} is not on PATH." >&2
			return 1
		}
	done
}

confirm_lint_install() {
	can_prompt_for_install || {
		printf 'Noninteractive setup: install tools first with brew install %s\n' "$*" >&2
		return 1
	}
	printf 'Install these with Homebrew? [y/N] '
	IFS= read -r lint_answer || return 1
	case "$lint_answer" in
	y | Y | [Yy][Ee][Ss]) return 0 ;;
	*)
		echo "Setup cancelled."
		return 1
		;;
	esac
}

can_prompt_for_install() {
	is_ci && return 1
	test -t 0
}

is_ci() {
	case "${CI:-}" in
	true | 1) return 0 ;;
	*) return 1 ;;
	esac
}

has_command() {
	command -v "$1" >/dev/null 2>&1
}

normalize_command() {
	command=${1:-setup}
	case "$command" in
	--hooks-only) echo "hooks" ;;
	*) echo "$command" ;;
	esac
}

main "$@"
