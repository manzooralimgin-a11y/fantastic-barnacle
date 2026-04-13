from datetime import date
from enum import Enum

from pydantic import BaseModel, Field

from app.hms.schemas import HotelReportDailyRead, HotelReportSummaryRead


class PmsReportType(str, Enum):
    COCKPITLISTE = "cockpitliste"
    HOUSEKEEPINGLISTE = "housekeepingliste"
    HAUS_STATUS = "haus_status"
    FB_VERPFLEGUNGSBERICHT = "fb_verpflegungsbericht"
    KASSENBUCH = "kassenbuch"
    ANZAHLUNGSLISTE = "anzahlungsliste"
    EINNAHMEBERICHT = "einnahmebericht"
    FINANZKONTEN_UEBERSICHT = "finanzkonten_uebersicht"
    OFFENE_SALDEN = "offene_salden"
    RECHNUNGSBERICHT = "rechnungsbericht"
    WARENGRUPPENJOURNAL = "warengruppenjournal"
    BELEGUNGSUEBERSICHT = "belegungsuebersicht"
    TAGESZAHLEN = "tageszahlen"
    BUCHUNGSQUELLENBERICHT = "buchungsquellenbericht"
    KENNZAHLENBERICHT = "kennzahlenbericht"
    CITY_TAX_BERICHT = "city_tax_bericht"
    GOBD_EXPORT = "gobd_export"
    MELDESCHEIN_DOWNLOAD = "meldeschein_download"
    FREMDENVERKEHRSSTATISTIK_XML = "fremdenverkehrsstatistik_xml"


class PmsReportDownloadQuery(BaseModel):
    type: PmsReportType
    start: date | None = None
    end: date | None = None
    property_id: int | None = Field(default=None, gt=0)


class PmsReportSummaryRead(HotelReportSummaryRead):
    pass


class PmsReportDailyRead(HotelReportDailyRead):
    pass
