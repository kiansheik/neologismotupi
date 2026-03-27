from pydantic import BaseModel, Field


class NewsletterSubscriptionOut(BaseModel):
    newsletter_key: str
    is_active: bool
    preferred_locale: str

    model_config = {"from_attributes": True}


class NewsletterSubscriptionUpdate(BaseModel):
    is_active: bool | None = None
    preferred_locale: str | None = Field(default=None, max_length=16)


class NewsletterUnsubscribeRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)
