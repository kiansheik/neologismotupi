from uuid import UUID

from pydantic import BaseModel, ConfigDict


class NavarroEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_word: str
    optional_number: str
    definition: str
