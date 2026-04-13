from app.hms.schemas import (
    HotelMessageSendRequest,
    HotelMessageTemplateCreate,
    HotelMessageTemplateRead,
    HotelMessageTemplateUpdate,
    HotelMessageThreadRead,
)


class PmsMessageTemplateCreate(HotelMessageTemplateCreate):
    pass


class PmsMessageTemplateUpdate(HotelMessageTemplateUpdate):
    pass


class PmsMessageTemplateRead(HotelMessageTemplateRead):
    pass


class PmsMessageThreadRead(HotelMessageThreadRead):
    pass


class PmsMessageSendRequest(HotelMessageSendRequest):
    pass
