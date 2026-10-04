# AI Trust & Reliability Engine (Module 9)

**Open Source Neighborhood Safety & Alert Network**

---

## 1. Overview & Purpose

The **AI Trust & Reliability Engine** estimates the credibility and reliability of incident reports submitted to the Neighborhood Safety Network. It acts as an explainable, decision-support mechanism for community members and moderators.

> [!IMPORTANT]
> **Decision Support Only**: The AI engine NEVER automatically punishes users, bans accounts, deletes reports, or triggers emergency dispatch services. Human moderators and emergency protocols remain strictly authoritative.

---

## 2. Real Application Data vs. Synthetic Training Data

To maintain clean separation between production integrity and ML experimentation:
- **Real Application Users & Incidents**: The application continues to rely on real authenticated user accounts, real community verifications, and real incident reports.
- **Synthetic Development Training Data**: The ML models were trained on a controlled synthetic dataset of 5,000 records (`ai/dataset/synthetic_incidents.csv`).
  - **Notice**: *The initial training dataset is synthetic and is intended for development and demonstration. It does not represent real users or real incidents.*
  - No synthetic records are inserted into production `users` or `incidents` tables.

---

## 3. Feature Definitions

| Feature | Type | Description |
|---|---|---|
| `category` | Categorical | Incident category (`ACCIDENT`, `FIRE`, `SUSPICIOUS_ACTIVITY`, `ROAD_HAZARD`, `FLOOD_WATERLOGGING`, `MEDICAL_EMERGENCY`, `INFRASTRUCTURE_ISSUE`, `OTHER`). |
| `severity` | Categorical | Urgency level (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`). Severity measures urgency, NOT reliability. |
| `confirmation_count` | Numeric | Count of distinct community confirmations from Module 5. |
| `dispute_count` | Numeric | Count of distinct community disputes from Module 5. |
| `confirmation_ratio` | Numeric | $\frac{\text{confirmations}}{\text{confirmations} + \text{disputes}}$. Evaluates to $0.5$ (neutral) when zero votes exist. |
| `incident_age_hours` | Numeric | Elapsed hours since incident creation. |
| `similar_incident_count`| Numeric | Count of nearby incidents of same category within 2 km and 24 hours. |
| `reporter_previous_reports` | Numeric | Total historical reports submitted by the reporting user. |
| `reporter_previous_confirmed_reports` | Numeric | Total previous reports from reporter confirmed by community/moderators. |
| `reporter_previous_disputed_reports` | Numeric | Total previous reports from reporter disputed by community. |
| `reporter_reliability` | Numeric | Historical reliability ratio $\frac{\text{confirmed} + 1}{\text{total} + 2}$. Defaults to $0.5$ for new reporters. |
| `nearby_incident_consistency` | Numeric | Aggregated density consistency of nearby verified activity ($0.0 - 1.0$). Exact user GPS coordinates are never passed to the ML model. |
| `moderation_history` | Numeric | Account moderation score ($-1.0$ repeatedly flagged to $+1.0$ consistently verified). |

---

## 4. Cold-Start Strategy & Confidence Scoring

A brand new incident or a new reporter will not immediately have accumulated community votes or history:
1. **Neutral Baseline**: New reporters receive a neutral reliability rating ($0.5$), ensuring they are not unfairly penalized.
2. **Cold-Start Confidence**:
   - $\text{votes} = 0$: Confidence is strictly marked **`LOW`**, and the UI displays a clear notice: *"Preliminary estimate: No community verifications recorded yet."*
   - $\text{votes} \in [1, 3]$: Confidence is **`MEDIUM`**.
   - $\text{votes} \ge 4$: Confidence is **`HIGH`**.
3. **Score vs. Confidence**: The Trust Score ($0 - 100$) estimates reliability probability, whereas Confidence Level reflects the volume of corroborating evidence.

---

## 5. Model Architecture & Selection

We compared candidate models using a stratified **70% Train / 15% Validation / 15% Test** split (Seed: 42):

1. **Baseline Model**: Logistic Regression (`class_weight='balanced'`)
   - Validation Accuracy: 98.27% | F1: 98.59% | ROC-AUC: 0.9995
2. **Candidate A**: Random Forest Classifier (`n_estimators=100`, `max_depth=8`)
   - Validation Accuracy: 98.40% | F1: 98.70% | ROC-AUC: 0.9985
3. **Candidate B (Selected)**: Gradient Boosting Classifier (`n_estimators=100`, `max_depth=4`, `learning_rate=0.1`)
   - Validation Accuracy: **98.67%** | F1: **98.92%** | ROC-AUC: **0.9991**

### Final Test Set Evaluation (Unseen 15% Test Set, 750 samples)
- **Accuracy**: 97.87%
- **Precision**: 98.28%
- **Recall**: 98.28%
- **F1-Score**: 98.28%
- **ROC-AUC**: 0.9988

### Confusion Matrix
- True Negatives: 278
- False Positives: 8
- False Negatives: 8
- True Positives: 456

### Trade-Offs in Safety Applications
- **False Positive (Unreliable flagged as Reliable)**: May cause neighbors to take precautionary actions for an unverified or exaggerated issue. Mitigated by displaying the Confidence Level and raw Community Vote counts alongside the AI score.
- **False Negative (Reliable flagged as Unreliable)**: May cause hesitation. Mitigated by allowing any resident or moderator to review and override community reports, and ensuring emergency alerts trigger via Module 4 rules regardless of AI score.

---

## 6. How to Reproduce & Retrain

```bash
# 1. Generate Synthetic Training Data (5,000 records)
python ai/dataset/generate_dataset.py

# 2. Train Candidates & Save Selected Pipeline
python ai/training/train_model.py

# 3. Evaluate Pipeline on Unseen Test Split
python ai/evaluation/evaluate_model.py

# 4. Run Python Pipeline Unit Tests
python ai/test_ai_pipeline.py
```
