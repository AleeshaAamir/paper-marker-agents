# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This is the AI marking module of a university final year project. It marks handwritten exam answers in **Urdu and English** using a pipeline of LLM agents. It is one component of a larger multi-person system:

- **OCR/scanning** (converting handwritten scripts to text) is owned by another team member and is **out of scope** for this module.
- **Secure result storage** (persisting marks/results) is owned by another team member and is **out of scope** for this module.
- This module's job is the **marking pipeline**: taking OCR'd answer text as input and producing marks/feedback as output via a sequence/pipeline of LLM agents.

Do not implement OCR or persistent/secure storage logic here — treat those as external services this module talks to.

## Stack

- **Language**: Python, using `pip` + a virtual environment (`venv`) for dependency management. No `requirements.txt`/`pyproject.toml` exists yet — create one as dependencies are added.
- **LLM provider/framework**: not yet decided. Do not assume a specific provider (OpenAI, Anthropic, etc.) or agent framework (LangChain, LangGraph, etc.) until it's chosen — check for a requirements file or existing imports before adding new LLM-related code, and ask if it's ambiguous.
- **Integration boundary**: this module is intended to expose/consume an **API or service boundary** (e.g. REST) to interface with the OCR module (for input) and the storage module (for output), rather than reading/writing shared files directly. When implementing these integrations, treat the OCR and storage teams' interfaces as external contracts — confirm request/response shapes rather than assuming them.

## Current state

The repository is currently empty (no source files, dependency manifest, or tests yet). This section and the commands below should be filled in as the project is scaffolded:

- Add setup/run/test/lint commands here once a `requirements.txt`/`pyproject.toml` and initial structure exist.
- Add an architecture section describing the agent pipeline (stages, agent responsibilities, how Urdu vs. English answers are handled differently if applicable) once that structure exists.
