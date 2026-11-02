"""Indicative country employment data for the Hiring Planner.

Figures are simplified planning estimates (2025-26 rules) and vary with salary
level, region, collective agreements and residency. They are not legal or tax
advice. `employer_rate` is the approximate employer-side statutory contribution
as a share of gross pay. `extra_months` is mandatory pay on top of 12 monthly
salaries (13th month, holiday allowance, etc.) where it is normally NOT already
included in a quoted annual salary.
"""

COUNTRIES = [
    {"code": "US", "name": "United States", "flag": "🇺🇸", "currency": "USD", "employer_rate": 0.10, "extra_months": 0,
     "pto_days": 0, "notice": "None required (at-will in most states)", "probation": "Not statutory",
     "notes": "FICA 7.65% plus federal/state unemployment; health insurance expected by candidates", "misclass_risk": "medium"},
    {"code": "CA", "name": "Canada", "flag": "🇨🇦", "currency": "CAD", "employer_rate": 0.10, "extra_months": 0,
     "pto_days": 10, "notice": "1–8 weeks by tenure and province (common law can be higher)", "probation": "Typically 3 months",
     "notes": "CPP/QPP, EI, provincial health levies; Québec has its own rules", "misclass_risk": "medium"},
    {"code": "GB", "name": "United Kingdom", "flag": "🇬🇧", "currency": "GBP", "employer_rate": 0.165, "extra_months": 0,
     "pto_days": 28, "notice": "1 week per year of service (max 12 weeks)", "probation": "Typically 3–6 months",
     "notes": "Employer NIC 15% above threshold; auto-enrolment pension min 3%; IR35 for contractors", "misclass_risk": "medium"},
    {"code": "IE", "name": "Ireland", "flag": "🇮🇪", "currency": "EUR", "employer_rate": 0.1115, "extra_months": 0,
     "pto_days": 20, "notice": "1–8 weeks by tenure", "probation": "Up to 12 months",
     "notes": "Employer PRSI 11.15%; 9 public holidays", "misclass_risk": "medium"},
    {"code": "DE", "name": "Germany", "flag": "🇩🇪", "currency": "EUR", "employer_rate": 0.21, "extra_months": 0,
     "pto_days": 20, "notice": "4 weeks, rising with tenure up to 7 months", "probation": "Up to 6 months",
     "notes": "Pension, health, long-term care, unemployment and accident insurance; contributions capped at ceilings", "misclass_risk": "high"},
    {"code": "FR", "name": "France", "flag": "🇫🇷", "currency": "EUR", "employer_rate": 0.42, "extra_months": 0,
     "pto_days": 25, "notice": "1–3 months (collective agreement)", "probation": "2–4 months, renewable once",
     "notes": "High social charges; sector collective agreement (CCN) always applies", "misclass_risk": "high"},
    {"code": "NL", "name": "Netherlands", "flag": "🇳🇱", "currency": "EUR", "employer_rate": 0.22, "extra_months": 0.96,
     "pto_days": 20, "notice": "1–4 months by tenure", "probation": "1–2 months",
     "notes": "8% statutory holiday allowance; 30% ruling for eligible expats", "misclass_risk": "high"},
    {"code": "ES", "name": "Spain", "flag": "🇪🇸", "currency": "EUR", "employer_rate": 0.31, "extra_months": 0,
     "pto_days": 22, "notice": "15 days; severance on dismissal", "probation": "Up to 6 months (collective agreement)",
     "notes": "Salary usually paid in 14 instalments (already inside the annual figure)", "misclass_risk": "high"},
    {"code": "PT", "name": "Portugal", "flag": "🇵🇹", "currency": "EUR", "employer_rate": 0.2375, "extra_months": 0,
     "pto_days": 22, "notice": "15–75 days by tenure; dismissal tightly regulated", "probation": "90–240 days by role",
     "notes": "14 salary payments (inside the annual figure); meal allowance customary", "misclass_risk": "high"},
    {"code": "IT", "name": "Italy", "flag": "🇮🇹", "currency": "EUR", "employer_rate": 0.37, "extra_months": 0,
     "pto_days": 20, "notice": "Set by national collective agreement (CCNL)", "probation": "Up to 6 months",
     "notes": "Includes TFR severance accrual (~6.9%); 13th/14th month inside the annual RAL", "misclass_risk": "high"},
    {"code": "PL", "name": "Poland", "flag": "🇵🇱", "currency": "PLN", "employer_rate": 0.205, "extra_months": 0,
     "pto_days": 20, "notice": "2 weeks – 3 months by tenure", "probation": "Up to 3 months",
     "notes": "B2B contractor setups are common but scrutinised", "misclass_risk": "medium"},
    {"code": "BR", "name": "Brazil", "flag": "🇧🇷", "currency": "BRL", "employer_rate": 0.36, "extra_months": 1.33,
     "pto_days": 22, "notice": "30 days + 3 days per year of service (max 90)", "probation": "Up to 90 days",
     "notes": "13th salary + 1/3 vacation bonus; FGTS 8%; meal/transport benefits customary", "misclass_risk": "high"},
    {"code": "MX", "name": "Mexico", "flag": "🇲🇽", "currency": "MXN", "employer_rate": 0.30, "extra_months": 0.6,
     "pto_days": 12, "notice": "Severance of 3 months + 20 days/year if dismissed without cause", "probation": "Up to 30 days (180 for managers)",
     "notes": "Aguinaldo (15 days), vacation premium, 10% profit sharing (PTU)", "misclass_risk": "high"},
    {"code": "CO", "name": "Colombia", "flag": "🇨🇴", "currency": "COP", "employer_rate": 0.25, "extra_months": 2.1,
     "pto_days": 15, "notice": "Severance scale by tenure and contract type", "probation": "Up to 2 months",
     "notes": "Prima (1 month), cesantías (1 month) + interest", "misclass_risk": "medium"},
    {"code": "AR", "name": "Argentina", "flag": "🇦🇷", "currency": "ARS", "employer_rate": 0.26, "extra_months": 1,
     "pto_days": 14, "notice": "15 days – 2 months", "probation": "6 months",
     "notes": "SAC (13th month) paid in two halves; high inflation means frequent salary reviews", "misclass_risk": "medium"},
    {"code": "IN", "name": "India", "flag": "🇮🇳", "currency": "INR", "employer_rate": 0.13, "extra_months": 0,
     "pto_days": 15, "notice": "Typically 30–90 days (contractual)", "probation": "Typically 3–6 months",
     "notes": "Provident Fund 12% of basic, gratuity ~4.8%; leave rules vary by state", "misclass_risk": "medium"},
    {"code": "PH", "name": "Philippines", "flag": "🇵🇭", "currency": "PHP", "employer_rate": 0.10, "extra_months": 1,
     "pto_days": 5, "notice": "30 days' written notice", "probation": "Up to 6 months",
     "notes": "Mandatory 13th month; SSS, PhilHealth, Pag-IBIG", "misclass_risk": "medium"},
    {"code": "VN", "name": "Vietnam", "flag": "🇻🇳", "currency": "VND", "employer_rate": 0.235, "extra_months": 0,
     "pto_days": 12, "notice": "30–45 days (indefinite-term contract)", "probation": "Up to 60 days (180 for managers)",
     "notes": "Social, health, unemployment insurance + 2% union fee; 13th month customary, not mandatory", "misclass_risk": "medium"},
    {"code": "SG", "name": "Singapore", "flag": "🇸🇬", "currency": "SGD", "employer_rate": 0.17, "extra_months": 0,
     "pto_days": 7, "notice": "Per contract (statutory 1 day – 4 weeks)", "probation": "Commonly 3–6 months",
     "notes": "CPF 17% applies to citizens and PRs only; AWS bonus customary", "misclass_risk": "low"},
    {"code": "JP", "name": "Japan", "flag": "🇯🇵", "currency": "JPY", "employer_rate": 0.16, "extra_months": 0,
     "pto_days": 10, "notice": "30 days", "probation": "Typically 3–6 months",
     "notes": "Health, pension, employment and accident insurance; bonuses customary", "misclass_risk": "medium"},
    {"code": "AU", "name": "Australia", "flag": "🇦🇺", "currency": "AUD", "employer_rate": 0.17, "extra_months": 0,
     "pto_days": 20, "notice": "1–5 weeks by tenure and age", "probation": "Up to 6 months (unfair-dismissal qualifying period)",
     "notes": "Superannuation 12% + state payroll tax above thresholds; Modern Awards may apply", "misclass_risk": "medium"},
    {"code": "AE", "name": "United Arab Emirates", "flag": "🇦🇪", "currency": "AED", "employer_rate": 0.06, "extra_months": 0,
     "pto_days": 22, "notice": "30–90 days", "probation": "Up to 6 months",
     "notes": "No income tax; end-of-service gratuity accrual for expats; pension for nationals", "misclass_risk": "low"},
    {"code": "ZA", "name": "South Africa", "flag": "🇿🇦", "currency": "ZAR", "employer_rate": 0.03, "extra_months": 0,
     "pto_days": 15, "notice": "1–4 weeks by tenure", "probation": "Reasonable period (commonly 3–6 months)",
     "notes": "UIF 1%, SDL 1%, COIDA; retirement funds customary", "misclass_risk": "low"},
    {"code": "NG", "name": "Nigeria", "flag": "🇳🇬", "currency": "NGN", "employer_rate": 0.12, "extra_months": 0,
     "pto_days": 6, "notice": "1 day – 1 month by tenure (contract usually longer)", "probation": "Commonly 3–6 months",
     "notes": "Pension 10%, NSITF 1%, ITF 1%", "misclass_risk": "medium"},
]

BY_CODE = {c["code"]: c for c in COUNTRIES}


def estimate_cost(country: dict, salary_usd: float, eor_fee_monthly: float) -> dict:
    gross = salary_usd * (1 + country["extra_months"] / 12)
    employer_taxes = gross * country["employer_rate"]
    eor_fees = eor_fee_monthly * 12
    return {
        "gross_pay": round(gross),
        "employer_taxes": round(employer_taxes),
        "eor_fees": round(eor_fees),
        "total": round(gross + employer_taxes + eor_fees),
    }
