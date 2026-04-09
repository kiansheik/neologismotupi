from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

from app.core.enums import FlashcardGrade

DEFAULT_FSRS_PARAMS: list[float] = [
    0.212,
    1.2931,
    2.3065,
    8.2956,
    6.4133,
    0.8334,
    3.0194,
    0.001,
    1.8722,
    0.1666,
    0.796,
    1.4835,
    0.0614,
    0.2629,
    1.6483,
    0.6014,
    1.8729,
    0.5425,
    0.0912,
    0.0658,
    0.1542,
]
DEFAULT_FSRS_VERSION = "fsrs-6"

S_MIN = 0.001
S_MAX = 36500.0
D_MIN = 1.0
D_MAX = 10.0


@dataclass(frozen=True)
class MemoryState:
    stability: float
    difficulty: float


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def grade_to_rating(grade: FlashcardGrade) -> int:
    mapping = {
        FlashcardGrade.again: 1,
        FlashcardGrade.hard: 2,
        FlashcardGrade.good: 3,
        FlashcardGrade.easy: 4,
    }
    return mapping[grade]


def _decay(params: Sequence[float]) -> float:
    return -float(params[20])


def _factor(params: Sequence[float]) -> float:
    decay = _decay(params)
    return math.exp(math.log(0.9) / decay) - 1.0


def power_forgetting_curve(delta_days: float, stability: float, params: Sequence[float]) -> float:
    stability = clamp(stability, S_MIN, S_MAX)
    factor = _factor(params)
    decay = _decay(params)
    return (delta_days / stability * factor + 1.0) ** decay


def next_interval_days(stability: float, desired_retention: float, params: Sequence[float]) -> float:
    stability = clamp(stability, S_MIN, S_MAX)
    factor = _factor(params)
    decay = _decay(params)
    return stability / factor * (desired_retention ** (1.0 / decay) - 1.0)


def _init_stability(rating: int, params: Sequence[float]) -> float:
    return float(params[rating - 1])


def _init_difficulty(rating: int, params: Sequence[float]) -> float:
    return float(params[4] - math.exp(params[5] * (rating - 1)) + 1)


def _linear_damping(delta_d: float, old_d: float) -> float:
    return (10.0 - old_d) * delta_d / 9.0


def _next_difficulty(difficulty: float, rating: int, params: Sequence[float]) -> float:
    delta_d = -params[6] * (rating - 3)
    return difficulty + _linear_damping(delta_d, difficulty)


def _mean_reversion(difficulty: float, params: Sequence[float]) -> float:
    init_d = _init_difficulty(4, params)
    return params[7] * (init_d - difficulty) + difficulty


def _stability_after_success(
    stability: float,
    difficulty: float,
    retrievability: float,
    rating: int,
    params: Sequence[float],
) -> float:
    hard_penalty = params[15] if rating == 2 else 1.0
    easy_bonus = params[16] if rating == 4 else 1.0
    return stability * (
        math.exp(params[8])
        * (11.0 - difficulty)
        * stability ** (-params[9])
        * (math.exp((1.0 - retrievability) * params[10]) - 1.0)
        * hard_penalty
        * easy_bonus
        + 1.0
    )


def _stability_after_failure(
    stability: float,
    difficulty: float,
    retrievability: float,
    params: Sequence[float],
) -> float:
    new_s = (
        params[11]
        * difficulty ** (-params[12])
        * ((stability + 1.0) ** params[13] - 1.0)
        * math.exp((1.0 - retrievability) * params[14])
    )
    new_s_min = stability / math.exp(params[17] * params[18])
    return min(new_s, new_s_min)


def _stability_short_term(stability: float, rating: int, params: Sequence[float]) -> float:
    sinc = math.exp(params[17] * (rating - 3 + params[18])) * stability ** (-params[19])
    if rating >= 2:
        sinc = max(sinc, 1.0)
    return stability * sinc


def fsrs_step(
    state: MemoryState | None,
    rating: int,
    delta_days: float,
    params: Sequence[float],
    *,
    is_initial: bool,
) -> MemoryState:
    stability = state.stability if state else 0.0
    difficulty = state.difficulty if state else 0.0

    last_s = clamp(stability, S_MIN, S_MAX)
    last_d = clamp(difficulty, D_MIN, D_MAX)

    retrievability = power_forgetting_curve(delta_days, last_s, params)
    new_s = _stability_after_success(last_s, last_d, retrievability, rating, params)
    if rating == 1:
        new_s = _stability_after_failure(last_s, last_d, retrievability, params)
    if delta_days == 0:
        new_s = _stability_short_term(last_s, rating, params)

    new_d = _next_difficulty(last_d, rating, params)
    new_d = _mean_reversion(new_d, params)
    new_d = clamp(new_d, D_MIN, D_MAX)

    if is_initial and stability == 0.0:
        new_s = _init_stability(rating, params)
        new_d = clamp(_init_difficulty(rating, params), D_MIN, D_MAX)

    return MemoryState(stability=clamp(new_s, S_MIN, S_MAX), difficulty=new_d)
