import sys
import shutil
import argparse
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c

PIPELINE_DIR = Path(__file__).resolve().parent
HOURS = c.kickoff_hours()

STAGES = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s10", "meta"]

SCRIPTS = {
    "s1": "s1_network.py",
    "s2": "s2_wbgt.py",
    "s3": "s3_shadow.py",
    "s4": "s4_surface.py",
    "s5": "s5_routes.py",
    "s6": "s6_optimize.py",
    "s7": "s7_cities.py",
    "s8": "s8_surface_png.py",
    "s10": "s10_kickoff.py",
    "meta": "meta.py",
}

OUTPUT_FILES = {
    "final": [
        c.OUT_DIR / "segments.geojson",
        c.OUT_DIR / "solutions.json",
        c.OUT_DIR / "kickoff_clock.json",
        c.OUT_DIR / "meta.json",
    ]
    + [c.OUT_DIR / f"shade_{h:02d}.png" for h in HOURS]
    + [c.OUT_DIR / f"expo_{h:02d}.png" for h in HOURS]
    + [
        c.OUT_DIR / "expo_meta.json",
        c.OUT_DIR / "cities.json",
        c.OUT_DIR / "cities_method.json",
        c.OUT_DIR / "kickoff_clock.json",
        c.OUT_DIR / "equity.json",
        c.OUT_DIR / "uhi_validation.json",
        c.OUT_DIR / "fan_volumes.json",
    ],
}


def stage_done(stage):
    if stage == "s2":
        return all((c.INTERIM_DIR / f"wbgt_{h:02d}.tif").exists() for h in HOURS)
    if stage == "s3":
        return (c.INTERIM_DIR / "dsm.tif").exists() and all(
            (c.INTERIM_DIR / f"shade_{h:02d}.tif").exists() for h in HOURS
        )
    if stage == "s4":
        return all((c.INTERIM_DIR / f"expo_{h:02d}.tif").exists() for h in HOURS)
    if stage == "s5":
        return (c.OUT_DIR / "segments.geojson").exists()
    if stage == "s6":
        return (c.OUT_DIR / "solutions.json").exists()
    if stage == "s10":
        return (c.OUT_DIR / "kickoff_clock.json").exists()
    if stage == "meta":
        return (c.OUT_DIR / "meta.json").exists()
    return False


def run_stage(stage):
    script = PIPELINE_DIR / SCRIPTS[stage]
    print(f"==> running {stage} ({script.name})")
    result = subprocess.run([sys.executable, str(script)], cwd=str(PIPELINE_DIR))
    if result.returncode != 0:
        raise SystemExit(f"stage {stage} failed with exit code {result.returncode}")


def copy_to_web():
    dest_dir = c.ROOT / "web" / "public" / "data"
    dest_dir.mkdir(parents=True, exist_ok=True)
    for path in OUTPUT_FILES["final"]:
        if path.exists():
            shutil.copy2(path, dest_dir / path.name)
            print(f"copied {path.name} to web/public/data/")
        else:
            print(f"warning: expected output {path} was not produced")


def main():
    parser = argparse.ArgumentParser(description="Run the thermal last mile pipeline stages in order")
    parser.add_argument("--force", action="store_true", help="rebuild every stage regardless of cache")
    parser.add_argument(
        "--force-stage",
        action="append",
        default=[],
        choices=STAGES,
        help="rebuild only this stage even if its outputs already exist, repeatable",
    )
    args = parser.parse_args()

    c.ensure_dirs()
    force_stages = set(args.force_stage)

    for stage in STAGES:
        if args.force or stage in force_stages or not stage_done(stage):
            run_stage(stage)
        else:
            print(f"==> skipping {stage}, output already exists")

    copy_to_web()


if __name__ == "__main__":
    main()
