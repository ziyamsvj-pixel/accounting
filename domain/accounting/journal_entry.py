# ... (کد قبلی تا _validate_double_entry)
    def post(self, posted_by: str) -> JournalPostedEvent:
        if self.posted_at:
            raise ValueError("Jورنال قبلاً پست شده است (Immutable)")
        self.posted_at = datetime.utcnow()
        self.posted_by = posted_by
        # Audit Event
        return JournalPostedEvent(entry_id=self.id, posted_at=self.posted_at, posted_by=posted_by)

    def add_line(self, line: JournalLine) -> None:
        if self.posted_at:
            raise ValueError("پس از پست، تغییر خط مجاز نیست (Immutable)")
        self.lines.append(line)
        self._validate_double_entry()
