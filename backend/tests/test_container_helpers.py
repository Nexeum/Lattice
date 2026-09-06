"""Unit tests for the pure CI helpers in container.py.

Importing container requires a reachable Docker daemon (docker.from_env at
module import) — available locally and on GitHub ubuntu runners. Only pure
functions are exercised; no endpoint or Mongo/Docker state is touched.
"""
import json

import pytest
from bson.objectid import ObjectId

import container


def f(name, content=None):
    return {"name": name, "content": content}


class TestPlanCiStepsPipelineFile:
    def test_legacy_array_form(self):
        ci = json.dumps([
            {"name": "Build", "run": "sh build.sh"},
            {"name": "Test", "run": "sh test.sh"},
        ])
        image, steps = container.plan_ci_steps([f("lattice-ci.json", ci)])
        assert image == container.CI_IMAGE
        assert steps == [
            {"name": "Build", "run": "sh build.sh"},
            {"name": "Test", "run": "sh test.sh"},
        ]

    def test_object_form_with_image_and_steps(self):
        ci = json.dumps({
            "image": "python:3.13-alpine",
            "steps": [{"name": "Lint", "run": "sh lint.sh"}],
        })
        image, steps = container.plan_ci_steps([f("lattice-ci.json", ci)])
        assert image == "python:3.13-alpine"
        assert steps == [{"name": "Lint", "run": "sh lint.sh"}]

    def test_object_form_blank_image_keeps_default(self):
        ci = json.dumps({"image": "   ", "steps": [{"name": "A", "run": "true"}]})
        image, steps = container.plan_ci_steps([f("lattice-ci.json", ci)])
        assert image == container.CI_IMAGE
        assert steps == [{"name": "A", "run": "true"}]

    def test_malformed_entries_are_filtered_out(self):
        ci = json.dumps([
            {"name": "OK", "run": "true"},
            {"name": "missing run"},
            "not-a-dict",
            {"run": "no name"},
        ])
        image, steps = container.plan_ci_steps([f("lattice-ci.json", ci)])
        assert steps == [{"name": "OK", "run": "true"}]

    def test_invalid_json_falls_back_to_defaults(self):
        files = [f("lattice-ci.json", "{not json"), f("install.sh", "echo hi")]
        image, steps = container.plan_ci_steps(files)
        assert image == container.CI_IMAGE
        assert steps == [{"name": "Install", "run": "sh install.sh"}]

    def test_json_with_no_usable_steps_falls_back(self):
        files = [f("lattice-ci.json", json.dumps({"steps": []}))]
        image, steps = container.plan_ci_steps(files)
        assert steps == [{"name": "Validate files", "run": "ls -la"}]


class TestPlanCiStepsConventions:
    def test_install_and_test_scripts(self):
        files = [f("install.sh", "echo i"), f("test.sh", "echo t")]
        image, steps = container.plan_ci_steps(files)
        assert image == container.CI_IMAGE
        assert steps == [
            {"name": "Install", "run": "sh install.sh"},
            {"name": "Test", "run": "sh test.sh"},
        ]

    def test_only_test_script(self):
        image, steps = container.plan_ci_steps([f("test.sh", "echo t")])
        assert steps == [{"name": "Test", "run": "sh test.sh"}]

    def test_no_known_files_uses_validate_fallback(self):
        image, steps = container.plan_ci_steps([f("readme.txt", "hello")])
        assert image == container.CI_IMAGE
        assert steps == [{"name": "Validate files", "run": "ls -la"}]

    def test_no_files_at_all_uses_validate_fallback(self):
        image, steps = container.plan_ci_steps([])
        assert steps == [{"name": "Validate files", "run": "ls -la"}]


class TestSerializeRun:
    def test_strips_files_and_stringifies_id(self):
        object_id = ObjectId()
        doc = {
            "_id": object_id,
            "status": "queued",
            "files": [{"name": "install.sh", "content": "echo hi"}],
        }
        out = container.serialize_run(doc)
        assert out["_id"] == str(object_id)
        assert isinstance(out["_id"], str)
        assert "files" not in out
        assert out["status"] == "queued"

    def test_does_not_mutate_input_doc(self):
        object_id = ObjectId()
        doc = {"_id": object_id, "files": [1, 2]}
        container.serialize_run(doc)
        assert doc["_id"] is object_id
        assert doc["files"] == [1, 2]

    def test_handles_doc_without_files(self):
        out = container.serialize_run({"_id": ObjectId(), "status": "success"})
        assert "files" not in out
        assert out["status"] == "success"


class TestParsePercent:
    @pytest.mark.parametrize("raw,expected", [
        ("1.23%", 1.23),
        (" 45% ", 45.0),
        ("0.00%", 0.0),
        ("12.5", 12.5),
    ])
    def test_parses_docker_stats_percentages(self, raw, expected):
        assert container.parse_percent(raw) == expected

    @pytest.mark.parametrize("raw", [None, "", "N/A", "--"])
    def test_bad_values_return_zero(self, raw):
        assert container.parse_percent(raw) == 0.0
