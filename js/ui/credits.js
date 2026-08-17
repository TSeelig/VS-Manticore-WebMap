export class Credits {
    constructor(elementId) {
        this.el = document.getElementById(elementId);
        this.text = this.el.querySelector('.left');
        this.toggler = this.el.querySelector('.right');
        this.togglerArrow = this.el.querySelector('.arrow');
        this.toggler.addEventListener('click', () => this.toggle());
        this.text.style.display = 'none';
        this.togglerArrow.textContent = '▶';
        this.state = 'hidden';
    }

    toggle() {
        if (this.state == 'visible') {
            this.text.style.display = 'none';
            this.state = 'hidden';
            this.togglerArrow.textContent = '▶';
        } else {
            this.text.style.display = 'block';
            this.state = 'visible';
            this.togglerArrow.textContent = '◀';
        }
    }
}
