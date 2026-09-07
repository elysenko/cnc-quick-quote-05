import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable, filter, map } from 'rxjs';
import { apiUrl } from '../api-base';
import { BendLine, Drawing } from '../models';

export type UploadEvent =
  | { kind: 'progress'; percent: number }
  | { kind: 'done'; drawing: Drawing };

@Injectable({ providedIn: 'root' })
export class DrawingsApi {
  private readonly http = inject(HttpClient);

  /** Uploads with real progress events so the wizard can show a live bar. */
  upload(file: File): Observable<UploadEvent> {
    const form = new FormData();
    form.append('file', file, file.name);

    return this.http
      .post<Drawing>(apiUrl('/drawings'), form, {
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        map((event): UploadEvent | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
            // Hold at 95% until the server answers: parsing happens after the
            // bytes land, and a bar that sits at 100% while nothing visibly
            // happens reads as a hang.
            return { kind: 'progress', percent: Math.min(95, percent) };
          }
          if (event.type === HttpEventType.Response && event.body) {
            return { kind: 'done', drawing: event.body };
          }
          return null;
        }),
        filter((e): e is UploadEvent => e !== null),
      );
  }

  get(id: string): Observable<Drawing> {
    return this.http.get<Drawing>(apiUrl(`/drawings/${id}`));
  }

  listBends(drawingId: string): Observable<BendLine[]> {
    return this.http.get<BendLine[]>(apiUrl(`/drawings/${drawingId}/bends`));
  }

  createBend(drawingId: string, bend: Omit<BendLine, 'id' | 'drawingId'>): Observable<BendLine> {
    return this.http.post<BendLine>(apiUrl(`/drawings/${drawingId}/bends`), bend);
  }

  updateBend(id: string, patch: Partial<Omit<BendLine, 'id' | 'drawingId'>>): Observable<BendLine> {
    return this.http.patch<BendLine>(apiUrl(`/bends/${id}`), patch);
  }

  deleteBend(id: string): Observable<void> {
    return this.http.delete<void>(apiUrl(`/bends/${id}`));
  }
}
