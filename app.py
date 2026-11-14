from flask import Flask, render_template, request, jsonify, Response
from planner_engine import generate_study_plan, generate_plan_ics, DEFAULT_POMODORO_MINUTES
from datetime import datetime
import base64
import json
import os
import sqlite3

app = Flask(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "study_planner.db")


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def db_get(key, default=None):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            row = conn.execute("SELECT value FROM app_state WHERE key = ?", (key,)).fetchone()
            if row:
                return json.loads(row[0])
    except Exception:
        pass
    return default


def db_set(key, value):
    now_iso = datetime.now().isoformat()
    payload = json.dumps(value, ensure_ascii=False)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO app_state (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (key, payload, now_iso),
        )
        conn.commit()


init_db()


# --- Serve Main Page ---
@app.route("/")
def index():
    return render_template("index.html")


# --- Persistent State API (SQLite Database) ---
@app.route("/api/state", methods=["GET"])
def get_saved_state():
    return jsonify({
        "success": True,
        "study_state": db_get("study_state"),
        "flow_state": db_get("flow_state"),
    })


@app.route("/api/state", methods=["POST"])
def save_app_state():
    try:
        data = request.get_json() or {}
        if "study_state" in data and data["study_state"] is not None:
            db_set("study_state", data["study_state"])
        if "flow_state" in data and data["flow_state"] is not None:
            db_set("flow_state", data["flow_state"])
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# --- Generate Study Plan API ---
@app.route("/generate-plan", methods=["POST"])
def generate_plan():
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        subjects = data.get("subjects", [])
        daily_hours = data.get("daily_hours", 0)
        preferred_time = data.get("preferred_time", "morning")
        focus_minutes = data.get("focus_minutes", DEFAULT_POMODORO_MINUTES)
        timezone = data.get("timezone", "Asia/Taipei")

        errors = validate_input(subjects, daily_hours, preferred_time)
        if errors:
            return jsonify({"error": errors}), 400

        plan = generate_study_plan(subjects, daily_hours, preferred_time, focus_minutes)
        ics_bytes = generate_plan_ics(
            plan=plan,
            preferred_time=preferred_time,
            daily_hours=daily_hours,
            timezone=timezone,
            course_name="Smart Study Plan",
        )
        plan["calendar_ics_b64"] = base64.b64encode(ics_bytes).decode("utf-8")

        # Automatically persist the generated plan and form inputs to SQLite DB
        db_set("study_state", {
            "subjects": subjects,
            "daily_hours": daily_hours,
            "preferred_time": preferred_time,
            "plan": plan,
            "saved_date": datetime.now().strftime("%Y-%m-%d"),
        })

        return jsonify({"success": True, "plan": plan})

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500


# --- Export .ics Calendar Endpoint (julianunesp integration) ---
@app.route("/export-ics", methods=["POST"])
def export_ics():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        subjects = data.get("subjects", [])
        daily_hours = data.get("daily_hours", 5)
        preferred_time = data.get("preferred_time", "morning")
        focus_minutes = data.get("focus_minutes", DEFAULT_POMODORO_MINUTES)
        timezone = data.get("timezone", "Asia/Taipei")
        course_name = data.get("course_name", "Smart Study Plan")

        if "plan" in data and isinstance(data["plan"], dict):
            plan = data["plan"]
        else:
            errors = validate_input(subjects, daily_hours, preferred_time)
            if errors:
                return jsonify({"error": errors}), 400
            plan = generate_study_plan(subjects, daily_hours, preferred_time, focus_minutes)

        ics_bytes = generate_plan_ics(
            plan=plan,
            preferred_time=preferred_time,
            daily_hours=daily_hours,
            timezone=timezone,
            course_name=course_name,
        )

        return Response(
            ics_bytes,
            mimetype="text/calendar; charset=utf-8",
            headers={
                "Content-Disposition": "attachment; filename=study_schedule.ics"
            },
        )
    except Exception as e:
        return jsonify({"error": f"Failed to export .ics: {str(e)}"}), 500



# --- Input Validation ---
def validate_input(subjects, daily_hours, preferred_time):
    errors = []

    if not subjects or len(subjects) == 0:
        errors.append("At least one subject is required.")

    if not isinstance(daily_hours, (int, float)) or daily_hours <= 0:
        errors.append("Daily study hours must be a positive number.")

    if daily_hours > 16:
        errors.append("Daily study hours cannot exceed 16.")

    valid_times = ["morning", "evening", "night"]
    if preferred_time.lower() not in valid_times:
        errors.append(f"Preferred time must be one of: {', '.join(valid_times)}.")

    valid_difficulties = ["easy", "medium", "hard"]
    for i, subject in enumerate(subjects):
        if not subject.get("name", "").strip():
            errors.append(f"Subject {i + 1}: Name is required.")

        difficulty = subject.get("difficulty", "").lower()
        if difficulty not in valid_difficulties:
            errors.append(f"Subject {i + 1}: Difficulty must be easy, medium, or hard.")

        exam_date = subject.get("exam_date", "")
        if not exam_date:
            errors.append(f"Subject {i + 1}: Exam date is required.")
        else:
            try:
                datetime.strptime(exam_date, "%Y-%m-%d")
            except ValueError:
                errors.append(f"Subject {i + 1}: Invalid date format (use YYYY-MM-DD).")

    return errors if errors else None


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
