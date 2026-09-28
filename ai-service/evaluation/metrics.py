"""
Metrics for your FYP evaluation chapter.

Report all four, split by language (Urdu vs English). The split is the whole
point - a single blended number hides the fact that Urdu is harder, which is
exactly the finding your project is well placed to contribute.

  MAE      - mean absolute error in marks. Intuitive for your supervisor.
  Within-1 - % of answers within 1 mark of the human. Intuitive for teachers.
  QWK      - quadratic weighted kappa. The standard metric in the automated
             essay scoring literature; cite it and your related-work section
             stops looking thin.
  Bias     - mean signed error. Tells you if the AI is systematically
             generous or harsh, which MAE alone hides.
"""

from typing import List, Dict


def mean_absolute_error(ai: List[float], human: List[float]) -> float:
    _check(ai, human)
    return sum(abs(a - h) for a, h in zip(ai, human)) / len(ai)


def bias(ai: List[float], human: List[float]) -> float:
    """Positive = AI is more generous than the human marker."""
    _check(ai, human)
    return sum(a - h for a, h in zip(ai, human)) / len(ai)


def within_tolerance(ai: List[float], human: List[float],
                     tolerance: float = 1.0) -> float:
    _check(ai, human)
    hits = sum(1 for a, h in zip(ai, human) if abs(a - h) <= tolerance)
    return hits / len(ai)


def quadratic_weighted_kappa(ai: List[float], human: List[float],
                             min_rating: int = 0,
                             max_rating: int = None) -> float:
    """
    QWK on integer mark bands. Marks are rounded to whole numbers first.
    1.0 = perfect agreement, 0.0 = chance agreement, negative = worse
    than chance.
    """
    _check(ai, human)
    a = [int(round(x)) for x in ai]
    h = [int(round(x)) for x in human]
    if max_rating is None:
        max_rating = max(max(a), max(h))
    num_ratings = max_rating - min_rating + 1
    if num_ratings < 2:
        return 1.0 if a == h else 0.0

    n = len(a)
    observed = [[0] * num_ratings for _ in range(num_ratings)]
    for x, y in zip(a, h):
        observed[x - min_rating][y - min_rating] += 1

    hist_a = [0] * num_ratings
    hist_h = [0] * num_ratings
    for x in a:
        hist_a[x - min_rating] += 1
    for y in h:
        hist_h[y - min_rating] += 1

    numerator = 0.0
    denominator = 0.0
    for i in range(num_ratings):
        for j in range(num_ratings):
            weight = ((i - j) ** 2) / ((num_ratings - 1) ** 2)
            expected = hist_a[i] * hist_h[j] / n
            numerator += weight * observed[i][j]
            denominator += weight * expected
    if denominator == 0:
        return 1.0
    return 1.0 - numerator / denominator


def report(ai: List[float], human: List[float],
           tolerance: float = 1.0) -> Dict[str, float]:
    return {
        "n": len(ai),
        "mae": round(mean_absolute_error(ai, human), 3),
        "bias": round(bias(ai, human), 3),
        f"within_{tolerance}": round(within_tolerance(ai, human, tolerance), 3),
        "qwk": round(quadratic_weighted_kappa(ai, human), 3),
    }


def _check(ai, human):
    if len(ai) != len(human):
        raise ValueError("Score lists must be the same length.")
    if not ai:
        raise ValueError("Empty score lists.")